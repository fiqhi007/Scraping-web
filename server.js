const express = require('express');
const cors = require('cors');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
const PORT = 3000;

// CONFIG
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enhanced Scraper dengan Puppeteer
app.get('/scrape', async (req, res) => {
    let browser;
    try {
        const { url } = req.query;
        if (!url) throw new Error('URL required');

        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        await page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        await autoScroll(page);

        const images = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).map(img => {
                const attributes = ['src', 'data-src', 'data-lazy-src', 'data-url', 'data-original'];
                for (const attr of attributes) {
                    const src = img.getAttribute(attr);
                    if (src && /\.(jpe?g|png|webp|gif)/i.test(src)) {
                        return src;
                    }
                }
                return null;
            }).filter(src => src !== null);
        });

        const baseUrl = new URL(url);
        const normalizedImages = images.map(imgUrl => {
            try {
                return new URL(imgUrl, baseUrl.origin).href;
            } catch {
                return imgUrl;
            }
        });

        res.json({ images: [...new Set(normalizedImages)] });

    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 500;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight || totalHeight >= 15000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 800);
        });
    });
}

app.post('/download', async (req, res) => {
    try {
        const { images } = req.body;
        if (!images?.length) throw new Error('No images selected');

        const archive = archiver('zip', { zlib: { level: 9 } });
        const zipPath = path.join(DOWNLOAD_DIR, `download_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);

        let fileCount = 0;
        const errors = [];
        
        archive.pipe(output);

        await Promise.all(images.map(async (url, index) => {
            try {
                if (!isValidImage(url)) {
                    errors.push(`Invalid image URL: ${url}`);
                    return;
                }

                const response = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream',
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        Referer: new URL(url).origin
                    }
                });

                if (response.status === 200) {
                    fileCount++;
                    const ext = getFileExtension(url) || 'jpg';
                    archive.append(response.data, { name: `image_${fileCount}.${ext}` });
                }
            } catch (error) {
                errors.push(`Failed to download: ${url} - ${error.message}`);
            }
        }));

        if (fileCount === 0) {
            archive.abort();
            fs.unlinkSync(zipPath);
            return res.status(400).json({ 
                error: 'Tidak ada gambar yang berhasil diunduh',
                details: errors
            });
        }

        await archive.finalize();

        output.on('close', () => {
            res.download(zipPath, (err) => {
                if (err) console.error('Download error:', err);
                fs.unlinkSync(zipPath);
            });
        });

    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            details: errors || []
        });
    }
});

function isValidImage(url) {
    return /\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i.test(url);
}

function getFileExtension(url) {
    const cleanedUrl = url.split(/[#?]/)[0];
    const extension = cleanedUrl.split('.').pop().trim().toLowerCase();
    return extension.match(/^(jpe?g|png|webp|gif|bmp)$/)?.[0] || 'jpg';
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});