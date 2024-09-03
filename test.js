const imageThumbnail = require('image-thumbnail');
const fs = require('fs');
const path = require('path');

const sizes = [500, 250, 100];
const localPath = '/mnt/c/Users/Thinkup/ALX/alx-files_manager/controllers/tmp/files_manager/38468bff-7366-43fe-8f24-cedb911d7bd5';

(async () => {
    for (const size of sizes) {
        try {
            const thumbnail = await imageThumbnail(localPath, { width: size });
            const thumbnailPath = `${localPath}_${size}`;
            fs.writeFileSync(thumbnailPath, thumbnail);
        } catch (err) {
            console.error(`Error generating thumbnail for size ${size}:`, err);
        }
    }
})();
