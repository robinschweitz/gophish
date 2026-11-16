const http = require("node:http")
const net = require("node:net")

function listen(server, port, host) {
    return new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(port, host, () => {
            server.removeListener("error", reject)
            resolve()
        })
    })
}

function close(server) {
    return new Promise((resolve) => server.close(resolve))
}

async function startSmtpSink() {
    const messages = []
    const smtpServer = net.createServer((socket) => {
        let buffer = ""
        let inData = false
        let messageLines = []

        socket.write("220 gophish-e2e.local ESMTP ready\r\n")

        socket.on("data", (chunk) => {
            buffer += chunk.toString("utf8")
            while (true) {
                const lineEnd = buffer.indexOf("\r\n")
                if (lineEnd < 0) break
                const line = buffer.slice(0, lineEnd)
                buffer = buffer.slice(lineEnd + 2)

                if (inData) {
                    if (line === ".") {
                        inData = false
                        messages.push(messageLines.join("\r\n"))
                        messageLines = []
                        socket.write("250 2.0.0 Message accepted\r\n")
                    } else {
                        messageLines.push(line.startsWith("..") ? line.slice(1) : line)
                    }
                    continue
                }

                const command = line.split(" ", 1)[0].toUpperCase()
                switch (command) {
                    case "EHLO":
                    case "HELO":
                        socket.write("250-gophish-e2e.local\r\n250-8BITMIME\r\n250-SIZE 52428800\r\n250 HELP\r\n")
                        break
                    case "MAIL":
                    case "RCPT":
                    case "RSET":
                    case "NOOP":
                        socket.write("250 2.1.0 OK\r\n")
                        break
                    case "DATA":
                        inData = true
                        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n")
                        break
                    case "QUIT":
                        socket.write("221 2.0.0 Bye\r\n")
                        socket.end()
                        break
                    default:
                        socket.write("502 5.5.1 Command not implemented\r\n")
                }
            }
        })
    })

    const httpServer = http.createServer((request, response) => {
        if (request.method === "GET" && request.url === "/messages") {
            response.writeHead(200, { "Content-Type": "application/json" })
            response.end(JSON.stringify(messages))
            return
        }
        if (request.method === "DELETE" && request.url === "/messages") {
            messages.length = 0
            response.writeHead(204)
            response.end()
            return
        }
        response.writeHead(404)
        response.end()
    })

    await listen(smtpServer, 1025, "0.0.0.0")
    await listen(httpServer, 8025, "127.0.0.1")

    return async () => {
        await Promise.all([close(smtpServer), close(httpServer)])
    }
}

module.exports = { startSmtpSink }
