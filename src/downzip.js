import registerServiceWorker from 'service-worker-loader!./downzip-sw'
import WorkerUtils from './WorkerUtils'
const Utils = new WorkerUtils('DownZip-Main')

const SCOPE = 'downzip'
const TIMEOUT_MS = 5000
const KEEPALIVE_INTERVAL_MS = 5000

class BC {
    #msgChannel
    #name
    onmessage

    constructor (channelName) {
        this.#name = channelName
        this.onmessage = null
        this.#msgChannel = new MessageChannel()
        this.#msgChannel.port1.onmessage = e => {
            if (this.onmessage) {
                this.onmessage(e)
            }
        }
    }

    postMessage (msg) {
        this.#msgChannel.port1.postMessage(msg)
    }

    get name () {
        return this.#name
    }

    get _port2 () {
        return this.#msgChannel.port2
    }
}

function createBroadcastChannel(name) {
    try {
        const bc = new BroadcastChannel(name)
        console.log('downzip: Using BroadcastChannel')
        return bc
    } catch (err) {
        console.log('downzip: Using MessageChannel')
        return new BC(name)
    }
}

class DownZip {
    constructor(){
        this.worker = null
    }

    async register(options = {}) {
        // Allow passing mapScriptUrl to service-worker-loader
        const defaultMapScriptUrl = scriptUrl => scriptUrl
        const mapScriptUrl = options.mapScriptUrl || defaultMapScriptUrl

        // Register service worker and let it intercept our scope
        await registerServiceWorker(mapScriptUrl, {
            scope: `./${SCOPE}/`
        }).then(result => {
            Utils.log('[DownZip] Service worker registered successfully:', result)
            this.worker = result.installing || result.active
        }).catch(error => {
            Utils.error('[DownZip] Service workers not loaded:', error)
        })

        // Start keep-alive timer
        setInterval(async () => {
            this.sendMessage('TICK')
        }, KEEPALIVE_INTERVAL_MS)
    }
    

    sendMessage(command, data, comms){
        this.worker.postMessage({
            command,
            data
        }, comms)
    }

    // Files array is in the following format: [{name: '', downloadUrl: '', size: 0, options = {}}, ...]
    // Available options: 
    //   fetchInit: An async/sync function returning the init object to be used with the fetch operation used for the download
    //   onProgress: A callback that takes a progress object of the form { id, file, progFile, progFileset, progTotal, done }
    //   onError: A callback that takes an error object of the form { id, file, error }
    async downzip(id, name, files, options = {}){
        const fetchInitChannel = createBroadcastChannel('DOWNZIP_FETCH_INIT')
        const progressChannel = createBroadcastChannel('DOWNZIP_PROGRESS_REPORT')
        const errorChannel = createBroadcastChannel('DOWNZIP_ERROR_REPORT')

        // Check if worker got created in the constructor
        if(!this.worker){
            Utils.error("[DownZip] No service worker registered!")
            return
        }

        fetchInitChannel.onmessage = async (e) => {
            if (e.data === 'REQUEST') {
                let initObj = null
                if (typeof options?.fetchInit === 'function') {
                    initObj = await options.fetchInit()
                } else if (typeof options?.fetchInit === 'object') {
                    initObj = options.fetchInit
                }

                fetchInitChannel.postMessage(initObj)
            }
        }

        progressChannel.onmessage = e => {
            if (options?.onProgress && e.data.id === id) {
                options.onProgress(e.data)
            }
        }

        errorChannel.onmessage = e => {
            if (options?.onError && e.data.id === id) {
                options.onError(e.data)
            }
        }

        return new Promise(((resolve, reject) => {
            // Return download URL on acknowledge via messageChannel
            const messageChannel = new MessageChannel()
            messageChannel.port1.addEventListener('message', () => resolve(`${SCOPE}/download-${id}`))
            messageChannel.port1.start()

            const comms = [
                messageChannel.port2,
                ...fetchInitChannel._port2 ? [fetchInitChannel._port2, progressChannel._port2, errorChannel._port2] : []
            ]

            // Init this task in our service worker
            this.sendMessage('INITIALIZE', {
                id,
                files,
                name
            }, comms)

            // Start timeout timer
            setTimeout(reject, TIMEOUT_MS)
        }))
    }
}

export default DownZip
