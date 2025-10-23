const { 
    giftedId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");


router.get('/', async (req, res) => {
    const id = giftedId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            await removeFile(path.join(sessionDir, id));
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        try {
            let Gifted = giftedConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Gifted.ev.on('creds.update', saveCreds);
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                
                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>ALI-MD | QR CODE</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                <style>
                                    body {
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        min-height: 100vh;
                                        margin: 0;
                                        background-color: #000;
                                        font-family: Arial, sans-serif;
                                        color: #fff;
                                        text-align: center;
                                        padding: 20px;
                                        box-sizing: border-box;
                                    }
                                    .container {
                                        width: 100%;
                                        max-width: 600px;
                                    }
                                    .qr-container {
                                        position: relative;
                                        margin: 20px auto;
                                        width: 300px;
                                        height: 300px;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                    }
                                    .qr-code {
                                        width: 300px;
                                        height: 300px;
                                        padding: 10px;
                                        background: white;
                                        border-radius: 20px;
                                        box-shadow: 0 0 0 10px rgba(255,255,255,0.1),
                                                    0 0 0 20px rgba(255,255,255,0.05),
                                                    0 0 30px rgba(255,255,255,0.2);
                                    }
                                    .qr-code img {
                                        width: 100%;
                                        height: 100%;
                                    }
                                    h1 {
                                        color: #fff;
                                        margin: 0 0 15px 0;
                                        font-size: 28px;
                                        font-weight: 800;
                                        text-shadow: 0 0 10px rgba(255,255,255,0.3);
                                    }
                                    p {
                                        color: #ccc;
                                        margin: 20px 0;
                                        font-size: 16px;
                                    }
                                    .back-btn {
                                        display: inline-block;
                                        padding: 12px 25px;
                                        margin-top: 15px;
                                        background: linear-gradient(135deg, #6e48aa 0%, #9d50bb 100%);
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 30px;
                                        font-weight: bold;
                                        border: none;
                                        cursor: pointer;
                                        transition: all 0.3s ease;
                                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                                    }
                                    .back-btn:hover {
                                        transform: translateY(-2px);
                                        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
                                    }
                                    .pulse {
                                        animation: pulse 2s infinite;
                                    }
                                    @keyframes pulse {
                                        0% {
                                            box-shadow: 0 0 0 0 rgba(255,255,255,0.4);
                                        }
                                        70% {
                                            box-shadow: 0 0 0 15px rgba(255,255,255,0);
                                        }
                                        100% {
                                            box-shadow: 0 0 0 0 rgba(255,255,255,0);
                                        }
                                    }
                                    @media (max-width: 480px) {
                                        .qr-container {
                                            width: 260px;
                                            height: 260px;
                                        }
                                        .qr-code {
                                            width: 220px;
                                            height: 220px;
                                        }
                                        h1 {
                                            font-size: 24px;
                                        }
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>ALI-MD QR CODE</h1>
                                    <div class="qr-container">
                                        <div class="qr-code pulse">
                                            <img src="${qrImage}" alt="QR Code"/>
                                        </div>
                                    </div>
                                    <p>Scan this QR code with your phone to connect</p>
                                    <a href="./" class="back-btn">Back</a>
                                </div>
                                <script>
                                    document.querySelector('.back-btn').addEventListener('mousedown', function(e) {
                                        this.style.transform = 'translateY(1px)';
                                        this.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
                                    });
                                    document.querySelector('.back-btn').addEventListener('mouseup', function(e) {
                                        this.style.transform = 'translateY(-2px)';
                                        this.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
                                    });
                                </script>
                            </body>
                            </html>
                        `);
                        responseSent = true;
                    }
                }

                if (connection === "open") {
    await delay(10000);

    let sessionData = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts && !sessionData) {
        try {
            const credsPath = path.join(sessionDir, id, "creds.json");
            if (fs.existsSync(credsPath)) {
                const data = fs.readFileSync(credsPath);
                if (data && data.length > 100) {
                    sessionData = data;
                    break;
                }
            }
            await delay(2000);
            attempts++;
        } catch (readError) {
            console.error("Read error:", readError);
            await delay(2000);
            attempts++;
        }
    }

    if (!sessionData) {
        await cleanUpSession();
        return;
    }

    try {
        let compressedData = zlib.gzipSync(sessionData);
        let b64data = compressedData.toString('base64');

        const Sess = await Gifted.sendMessage(Gifted.user.id, { text: 'Gifted~' + b64data });

        // Fetch user profile picture for ExternalAdReply
        let profilePicUrl = 'https://files.catbox.moe/zauvq6.jpg'; // fallback
        try {
            profilePicUrl = await Gifted.profilePictureUrl(Gifted.user.id);
        } catch (e) { console.error('No pfp:', e); }

        const externalAdMsg = {
            image: { url: profilePicUrl },
            caption: `
*👋🏻 ʜᴇʏ ᴛʜᴇʀᴇ, ᴀʟɪ-ᴍᴅ ʙᴏᴛ ᴜsᴇʀ!*

*🔐 ʏᴏᴜʀ sᴇssɪᴏɴ ɪᴅ ɪs ʀᴇᴀᴅʏ!*
*⚠️ ᴅᴏ ɴᴏᴛ sʜᴀʀᴇ ᴛʜɪs ɪᴅ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ.*

 *🪀 ᴄʜᴀɴɴᴇʟ:*  
*https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h*

 *🖇️ ʀᴇᴘᴏ:*
*https://github.com/ALI-INXIDE/ALI-MD*

> *© ᴘσωєʀє∂ ву αℓι м∂⎯꯭̽💀🚩*
`,
            contextInfo: {
                externalAdReply: {
                    title: '𝐒𝐄𝐒𝐒𝐈𝐎𝐍 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 🎀',
                    body: 'Click to visit',
                    mediaType: 1,
                    thumbnailUrl: profilePicUrl,
                    sourceUrl: 'https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h'
                },
                mentionedJid: [Gifted.user.id]
            }
        };

        await Gifted.sendMessage(Gifted.user.id, externalAdMsg, { quoted: Sess });

        await delay(2000);
        await Gifted.ws.close();
    } catch (sendError) {
        console.error("Error sending external ad session:", sendError);
    } finally {
        await cleanUpSession();
    }
}

    try {
        await GIFTED_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
