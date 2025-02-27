const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Config
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Scrape Endpoint
app.get('/scrape', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) throw new Error('URL required');

        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        
        const images = [];
        $('img').each((i, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src');
            if (src) {
                if (!src.startsWith('http')) {
                    const baseUrl = new URL(url);
                    src = new URL(src, baseUrl.origin).href;
                }
                images.push(src);
            }
        });

        res.json({ images: [...new Set(images)] }); // Remove duplicates
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download Endpoint
app.post('/download', async (req, res) => {
    try {
        const { images } = req.body;
        if (!images?.length) throw new Error('No images selected');

        const archive = archiver('zip', { zlib: { level: 9 } });
        const zipPath = path.join(DOWNLOAD_DIR, `${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);

        archive.pipe(output);
        
        // Add files to archive with error handling
        await Promise.all(images.map(async (url, index) => {
            try {
                const response = await axios.get(url, { responseType: 'stream' });
                archive.append(response.data, { name: `image_${index + 1}.${url.split('.').pop()}` });
            } catch (error) {
                console.error(`Failed to download: ${url}`);
            }
        }));

        await archive.finalize();

        output.on('close', () => {
            res.download(zipPath, () => fs.unlinkSync(zipPath));
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});