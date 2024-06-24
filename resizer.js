import temp from 'temp-write';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffprobePath } from "@ffprobe-installer/ffprobe";
import fs from 'fs';
import sharp from 'sharp';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath)

if (!fs.existsSync('./resized')) {
    fs.mkdirSync('./resized')
}

const aspectRatio = process.argv[2];
const width = Number(aspectRatio.split('x')[0]);
const height = Number(aspectRatio.split('x')[1]);

function getDimensions(media) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(media, async (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            resolve({
                mediaWidth: metadata.streams[0].width,
                mediaHeight: metadata.streams[0].height,
            });
        });
    });
}

function FFMpegPromisify(routine, output) {
    return new Promise((resolve, reject) => {
        routine
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                resolve();
            })
            .save(output);
    });
}


async function resize({ data, width, height, name }) {
    let path = temp.sync(data);
    const { mediaWidth, mediaHeight } = await getDimensions(path);
    let mediaAspectRatio = mediaWidth / mediaHeight;
    let widthResizeRatio = width / mediaWidth;
    let heightResizeRatio = height / mediaHeight;
    let maxAdjustedWidth = Math.round(Math.max(mediaWidth * widthResizeRatio, height * mediaAspectRatio));
    let maxAdjustedHeight = Math.round(Math.max(mediaHeight * heightResizeRatio, width / mediaAspectRatio));

    let tempResizePath = temp.sync('', 'file.mp4');
    await FFMpegPromisify(ffmpeg(path).format('mp4').size(`${maxAdjustedWidth}x${maxAdjustedHeight}`), tempResizePath);

    let tempCropPath = temp.sync('', 'file.mp4');
    let cropX = (maxAdjustedWidth - width) / 2;
    let cropY = (maxAdjustedHeight - height) / 2;
    await FFMpegPromisify(ffmpeg(tempResizePath).format('mp4').videoFilter([
        {
            filter: "crop",
            options: {
                w: width,
                h: height,
                x: cropX,
                y: cropY
            },
        }
    ]), `./resized/${name}.mp4`);

    return tempCropPath; // contains the final, cropped result
}

(async function main() {
    const folder = fs.readdirSync('./assets');
    const videos = folder.filter(filename => filename.includes('.mp4'));
    videos.forEach(async (fileName) => {
        let file = fs.readFileSync(`./assets/${fileName}`);
        await resize({ data: file, width: width, height: height, name: fileName });
    })
    const images = folder.filter(filename => filename.includes('.jpg') || filename.includes('.jpeg') || filename.includes('.png'));
    images.forEach((image) => {
        sharp(`./assets/${image}`).resize(width, height).toFile(`./resized/${image}`);
    })
})();
