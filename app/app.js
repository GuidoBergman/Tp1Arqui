import {nanoid} from "nanoid"
import express from "express"
import axios from "axios"
import { createClient } from "redis"

const app = express();
const redisClient = createClient({url: 'redis://redis:6379'});

(async () => {
    await redisClient.connect();
})();

process.on('SIGTERM', async () => {
    await redisClient.quit();
});

const id = nanoid();

app.use((req, res, next) => {
    res.setHeader('API-id', id);
    next();
});

app.get('/', async(req, res) => {
    res.status(200).send('ping');
})

app.get('/space_news', async (req, res) => {
    let tittles;
    const tittlesString = await redisClient.get('space_news');

    if (tittlesString !== null){
        tittles = JSON.parse(tittlesString);
    } else {
        const response = await axios.get('https://api.spaceflightnewsapi.net/v3/articles');
        tittles = []
        
        response.data.forEach(element => {
            if (element.hasOwnProperty('title')){
                tittles.push(element.title);
            }
        });

        await redisClient.set('space_news', JSON.stringify(tittles),{
            EX:5
        });
    }

    res.status(200).send(tittles);
})

app.listen(3000)