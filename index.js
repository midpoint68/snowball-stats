const express = require('express');
const app = express();
const { spawn } = require('child_process');

// Serve Static Files
app.use(express.static("public"));

// Setup Cache Class
class Cache {
    fetch;      // method that returns current value
    data = "Loading... Try again in a few minutes.";       // current value
    updated = 0;    // when it was last updated in ms
    ttl;        // time to live in ms
    constructor(fetch, ttl) {
        this.fetch = fetch;
        this.ttl = ttl ?? 1000 * 60 * 15; // 15 min
        this.update();
    }
    update() {
        this.fetch().then(data => {
            this.data = data;
            console.log("Updated Cache...");
            console.log(this.data);
        });
        this.updated = Date.now();
    }
    get value() {
        const now = Date.now();
        if (now - this.updated > this.ttl) {
            this.update();
        }
        return this.data;
    }
}

// Setup page caches
const script_cache = (script, args) => {
    return new Cache(() => {
        return new Promise((resolve, reject) => {
            const child = spawn(script, args);
            let output = "";
            child.stdout.on('data', (data) => {
                output += data;
            });
            child.on('close', (code) => {
                if (code) reject(code);
                else resolve(output);
            });
        });
    })
};
const snob_basic_cache = script_cache("node", ["snob.js", "basic"]);
const snob_cache = script_cache("node", ["snob.js"]);
const axial_basic_cache = script_cache("node", ["axial.js", "basic"]);
const axial_cache = script_cache("node", ["axial.js"]);
const dist_cache = script_cache("node", ["dist.js"]);

// Paths
app.get('/snob_basic', async (req, res) => {
    res.send(snob_basic_cache.value);
});
app.get('/snob', async (req, res) => {
    res.send(snob_cache.value);
});
app.get('/axial_basic', async (req, res) => {
    res.send(axial_basic_cache.value);
});
app.get('/axial', async (req, res) => {
    res.send(axial_cache.value);
});
app.get('/dist', async (req, res) => {
    res.send(dist_cache.value);
});

app.listen(3000);