// backpressure

const express = require("express");
const http = require("http");
const { once } = require("events");

const app = express();

const CHUNK = Buffer.alloc(64 * 1024, 120);
const TOTAL_CHUNKS = 64;
const TRAILER = Buffer.from("done");
const EXPECTED_BYTES = CHUNK.length * TOTAL_CHUNKS + TRAILER.length;

let serverHadBackpressure = false;
let serverSawDrain = false;

app.get("/test", async (_req, res) => {
    res.type("application/octet-stream");

    for(let i = 0; i < TOTAL_CHUNKS; i++) {
        if(!res.write(CHUNK)) {
            serverHadBackpressure = true;
            await once(res, "drain");
            serverSawDrain = true;
        }
    }

    res.end(TRAILER);
});

app.listen(13333, () => {
    console.log("Server is running on port 13333");

    const timeout = setTimeout(() => {
        console.error("client timeout");
        process.exit(1);
    }, 8000);
    timeout.unref();

    const req = http.get("http://127.0.0.1:13333/test", {
        headers: {
            Connection: "close"
        }
    }, (res) => {
        let totalBytes = 0;

        res.pause();
        setTimeout(() => res.resume(), 250);
        res.on("data", (chunk) => {
            totalBytes += chunk.length;
            res.pause();
            setTimeout(() => res.resume(), 5);
        });
        res.on("end", () => {
            clearTimeout(timeout);
            const ok = serverHadBackpressure && serverSawDrain && totalBytes === EXPECTED_BYTES && res.statusCode === 200;
            if(!ok) {
                console.error("unexpected result", {
                    serverHadBackpressure,
                    serverSawDrain,
                    totalBytes,
                    expectedBytes: EXPECTED_BYTES,
                    statusCode: res.statusCode
                });
                process.exit(1);
            }
            console.log(serverHadBackpressure);
            console.log(serverSawDrain);
            console.log(totalBytes === EXPECTED_BYTES);
            console.log(res.statusCode);
            process.exit(0);
        });
    });

    req.on("error", (err) => {
        clearTimeout(timeout);
        const detail = err.message && err.code ? `${err.message} (${err.code})` : err.message || err.code || String(err);
        console.error(detail);
        process.exit(1);
    });
});
