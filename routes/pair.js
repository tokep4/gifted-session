const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        try {
            let Gifted = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000, 
                keepAliveIntervalMs: 30000
            });

            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                const randomCode = generateRandomCode();
                const code = await Gifted.requestPairingCode(num, randomCode);
                
                if (!responseSent && !res.headersSent) {
                    res.json({ code: code });
                    responseSent = true;
                }
            }

            Gifted.ev.on('creds.update', saveCreds);
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(8000);
                    
                    const credsPath = path.join(sessionDir, id, "creds.json");
                    if (!fs.existsSync(credsPath)) {
                        await cleanUpSession();
                        return;
                    }

                    try {
                        const sessionData = fs.readFileSync(credsPath);
                        const compressedData = zlib.gzipSync(sessionData);
                        const b64data = compressedData.toString('base64');

                        const Sess = await Gifted.sendMessage(Gifted.user.id, { text: 'Gifted~' + b64data });

                        let pfp;
                        try { 
                            pfp = await Gifted.profilePictureUrl(Gifted.user.id, 'image'); 
                        } catch {
                            pfp = 'https://files.catbox.moe/zauvq6.jpg';
                        }

                        const GIFTED_TEXT = `
*👋🏻 ʜᴇʏ ᴛʜᴇʀᴇ, ᴀʟɪ-ᴍᴅ ʙᴏᴛ ᴜsᴇʀ!*

*🔐 ʏᴏᴜʀ sᴇssɪᴏɴ ɪᴅ ɪs ʀᴇᴀᴅʏ!*
*⚠️ ᴅᴏ ɴᴏᴛ sʜᴀʀᴇ ᴛʜɪs ɪᴅ ᴡɪᴛʜ ᴀɴʏᴏɴᴇ.*

 *🪀 ᴄʜᴀɴɴᴇʟ:*  
*https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h*

 *🖇️ ʀᴇᴘᴏ:*
*https://github.com/ALI-INXIDE/ALI-MD*

> *© ᴘσωєʀє∂ ву αℓι м∂⎯꯭̽💀🚩*
`;

                        await Gifted.sendMessage(Gifted.user.id, { 
                            text: GIFTED_TEXT, 
                            contextInfo: { 
                                externalAdReply: { 
                                    title: '𝐒𝐄𝐒𝐒𝐈𝐎𝐍 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 🎀', 
                                    thumbnailUrl: pfp, 
                                    sourceUrl: 'https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h', 
                                    mediaType: 1, 
                                    renderLargerThumbnail: true
                                }
                            }
                        });

                        await delay(2000);
                        await Gifted.ws.close();
                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    } finally {
                        await cleanUpSession();
                    }

                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    console.log("Reconnecting...");
                    await delay(5000);
                    GIFTED_PAIR_CODE();
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
