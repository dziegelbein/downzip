import '@babel/polyfill'
import WorkerUtils from './WorkerUtils'
import Zip from './zip/Zip'
import ZipUtils from './zip/ZipUtils'
const Utils = new WorkerUtils('DownZipServiceWorker')

// /////////// GLOBAL OBJECTS /////////// //
const zipMap = {}

// Create channels for communicating fetch init parameters, errors, etc.
const fetchInitChannel = new BroadcastChannel('DOWNZIP_FETCH_INIT')
const progressReportChannel = new BroadcastChannel('DOWNZIP_PROGRESS_REPORT')
const errorReportChannel = new BroadcastChannel('DOWNZIP_ERROR_REPORT')

const getFetchInit = async () => {
    return await new Promise(resolve => {
        fetchInitChannel.onmessage = e => {
            resolve(e.data)
        }

        fetchInitChannel.postMessage('REQUEST')
    })
}

const reportProgress = (id, file, progFile, progFileset, progTotal, done) => {
    progressReportChannel.postMessage({ id, file, progFile, progFileset, progTotal, done })
}

const reportError = (id, file, err) => {
    errorReportChannel.postMessage({ id, file, err })
}

// ////////// MESSAGE HANDLERS ////////// //
const initialize = (data, ports) => {
    Utils.log(`Initialize called: ${JSON.stringify(data)}`)
    const {id, files, name} = data

    // Decide whether to use zip64
    const totalSizeBig = ZipUtils.calculateSize(files)
    Utils.log(`Total estimated file size: ${totalSizeBig}`)
    const zip64 = (totalSizeBig >= BigInt('0xFFFFFFFF'))

    // Start new Zip object and add to the map
    zipMap[id] = {
        files,
        name,
        zip: new Zip(zip64),
        sizeBig: totalSizeBig
    }

    // Acknowledge reception
    if(ports.length > 0)
        ports[0].postMessage({command: 'ACKNOWLEDGE'})
}

// This message is here to keep the service worker from getting killed while downloading.
// TODO: Only send tick while actually downloading
const tick = () => {
    Utils.log(`Tock`)
}


// /////////// EVENT HANDLERS /////////// //
self.addEventListener('install', () => {
    Utils.log("Installing worker and skip waiting")
    skipWaiting()
})

self.addEventListener('activate', () => {
    Utils.log("Activating worker and skip waiting")
    skipWaiting()
    self.clients.claim()
})

self.addEventListener('fetch', async (event) => {
    // Get URL and check if it is a download request
    const urlParts = event.request.url.split('/')
    const lastPart = urlParts[urlParts.length - 1]
    if(lastPart.includes('download-')) {
        // Get download id
        const id = lastPart.replace('download-', '')
        Utils.log(`Fetch called for download id: ${id}`)

        // Setup progress tracking variables
        let progFile = 0
        let progFileset = 0
        let file = zipMap[id].files?.[0]
        let reader
        const progTotal = zipMap[id].files.reduce((sum, f) => sum + parseInt(f.size, 10), 0)

        // Check if initialized
        if(!zipMap[id]){
            Utils.error(`No zip initialized for id: ${id}`)
            return
        }

        try {
            // Respond with the zip outputStream
            event.respondWith(new Response(
                zipMap[id].zip.outputStream,
                {headers: new Headers({
                    'Content-Type': 'application/octet-stream; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${zipMap[id].name}.zip"`,
                    'Content-Length': zipMap[id].sizeBig  // This is an approximation, does not take into account the headers
                })}
            ))            

            reportProgress(id, file, progFile, progFileset, progTotal, false)

            // Start feeding zip the downloads
            for(let i=0; i<zipMap[id].files.length; i++){
                reader = null
                file = zipMap[id].files[i]

                // Start new file in the zip
                zipMap[id].zip.startFile(file.name)

                progFile = 0

                // Append all the downloaded data 
                const fetchInit = await getFetchInit()

                const response = await fetch(file.downloadUrl, fetchInit)

                if (!response.ok) {
                    reportError(id, file, new Error(`${response.status} ${response.statusText}`))
                }

                reader = response.body.getReader()
                let doneReading = false
                while (!doneReading) {
                    const chunk = await reader.read()
                    const {done, value} = chunk

                    if (done) {
                        // If this stream has finished, return
                        doneReading = true
                    } else {
                        // If not, append data to the zip
                        zipMap[id].zip.appendData(value)
                        progFile += value.length 
                        progFileset += value.length
                        reportProgress(id, file, progFile, progFileset, progTotal, false)
                    }
                }  
                
                // End file
                zipMap[id].zip.endFile()                    
            }

            // End zip
            zipMap[id].zip.finish()    
        } catch (e) {
            if (reader) {
                reader.cancel()
            }
            if (!zipMap[id]?.zip?.canceled) {
                reportError(id, file, e)
            }
            Utils.error(`Error while piping data into zip: ${e.toString()}`)
        } finally {
            reportProgress(id, file, progFile, progFileset, progTotal, true)
            Utils.log("Done with this zip!")
        }
    } else {
        Utils.log('Fetch called for a non-download. Doing nothing')
    }
})

self.addEventListener('error', (message, url, lineNo) => {
    Utils.log(`Error: ${message} at line number: ${lineNo}. Handling URL ${url}`)
    return true
})

const messageHandlers = {
    'INITIALIZE': initialize,
    'TICK': tick
}
self.addEventListener('message', async (event) => {
    const {data, ports} = event
    const handler = messageHandlers[data.command]
    if(handler){
        await handler(data.data, ports)
    } else {
        Utils.error(`Handler for command does not exist: ${data.command}`)
    }
})