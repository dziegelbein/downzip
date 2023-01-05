const DEBUG = false

class WorkerUtils {
    constructor(name){
        this.name = name
    }

    error = (message) => {
        console.error(`[${this.name}] ${message}`)
    }

    log = (message) => {
        DEBUG && console.log(`[${this.name}] ${message}`)
    }

    /**
     * Merge headers from source into target
     * (based on a solution found at https://stackoverflow.com/questions/62878591/merge-objects-updating-duplicate-keys-case-insensitively)
     * @param {Object} target A JSON object holding the headers to be replaced/added to
     * @param {Object} source A JSON object holding the headers to merge into target
     * @returns a new JSON object containing the result of the merge
     */
    mergeHeaders = (target, source) => {
        if (!source) {
            return { ...target }
        }

        const keys = Object.keys(target).reduce((o, k) => ((o[k.toLowerCase()] = k), o), {})
        return Object.entries(source).reduce((o, [k, v]) => {
          const lowerK = k.toLowerCase()
          const key = lowerK in keys ? keys[lowerK] : k
          o[key] = v;
          return o
        }, { ...target }) // start with a shallow copy
        return ro
      }
}

export default WorkerUtils