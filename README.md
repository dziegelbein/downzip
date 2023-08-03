**IMPORTANT**

This package is based on a fork of v2.0.1 of https://www.npmjs.com/package/downzip

It adds an optional fourth parameter to the downzip method. That parameter is an object that may contain any of the
following:
- fetchInit: An async/sync function returning the init object to be used with the fetch operation used for the download
    of individual files added to the zip archive
- responseHeaders: An object of headers to use in the zip response. This overrides/adds to the headers that downzip
    sends automatically. For example, setting this to { 'content-type': 'application/zip' } will result in the response
    containing a content-type header of 'application/zip' (the default is 'application/octet-stream'), with the
    content-disposition and content-length headers remaining as downzip determines.
- onProgress: A callback that takes a progress object of the form { id, file, progFile, progFileset, progTotal, done }
- onError: A callback that takes an error object of the form { id, file, error }

For example, to set the Authorization header for each file download and override the default Content-Type response
header:

```
const downZip = new DownZip()
const url = await downZip.downzip(
      uuidv4(), // download id
      'zipfile', // name of zip file
      filesToZip, // array of files to add to zip
      { 
        fetchInit: () => ({ headers: { Authorization: `Bearer ${getAccessToken()}` } }),
        responseHeaders: { 'Content-Type': 'application/zip' }
      }
    )
```

NOTES: 
1. fetchInit can be a simple object if its value never changes.
1. The merge of responseHeaders with the default headers is case-insensitive with respect to header names, e.g.
  passing { 'content-type': 'application/zip' } has the same result as passing { 'Content-Type': 'application/zip' }, 
  that is, it will override the default 'Content-Type' header.

---


# DownZip
[![Maintainability](https://api.codeclimate.com/v1/badges/862b0665619d30cd322e/maintainability)](https://codeclimate.com/github/robbederks/downzip/maintainability)[ ![Test Coverage](https://api.codeclimate.com/v1/badges/862b0665619d30cd322e/test_coverage)](https://codeclimate.com/github/robbederks/downzip/test_coverage)

The `package.json` description says it all: "Library to enable client-side code to stream potentially large files into a zipped download"

## Features
* Client-side generation of ZIP files from supplied single-file download URLs
* Support for ZIP64 (ZIP files bigger than 4GB)
* Everything is streamed, no data has to be held in RAM
* No compression is applied, so the CPU load is tiny

## Installation
1. Install npm package: `npm install downzip`
2. Make sure the service worker is copied to your output directory. For example, setup [copy-webpack-plugin](https://www.npmjs.com/package/copy-webpack-plugin) to put the service worker in your output directory:
```
// Add copy rule for downzip service worker
new CopyPlugin([
    {
        from: 'node_modules/downzip/dist/downzip-sw.js',
        to: '.'
    }
])
```

## Example usage
```
import DownZip from 'downzip'

// Setup downzip object
const downZip = new DownZip()
await downZip.register()

// Initialize download
const downloadId = "aaaabbbb"
const zipFileName = "downzip-file"
const files = [
    {
        name: 'picture1.jpg' 
        downloadUrl: 'http://your-download-url.com/picture1.jpg'
        size: 1234      // In bytes
    }, 
    {
        name: 'picture2.jpg' 
        downloadUrl: 'http://your-download-url.com/picture2.jpg'
        size: 4567      // In bytes
    }
]
const downloadUrl = await downZip.downzip(
    downloadId,
    zipFileName,
    files
)

```
```
// Start download when user clicks the link
<a href={downloadUrl}>Click to start downloading!</a>
```

## service-worker-loader options
Can pass `mapScriptUrl` function to the `register` method. That function gets used by
service-worker-loader. [docs](https://github.com/mohsen1/service-worker-loader#registerserviceworkermapscripturl-scripturl-string--string-options-registrationoptions-promiseserviceworkerregistration)

```js
    const mapScriptUrl = scriptUrl => scriptUrl.replace('localhost', "127.0.0.1")

   // Setup downzip object
    const downZip = new DownZip()
    await downZip.register({ mapScriptUrl })
```

## TODO
All improvements are welcome, but the main things that need to be improved at the moment are:
* Automated Testing
* Only send the keep-alive service worker message when there is a download queued up / in progress
* Find an easier way to install this package / service worker in projects

Please submit pull requests, I'm more than happy to merge in improvements!


