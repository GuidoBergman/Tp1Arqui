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

app.use(function(req, res, next) {
    res.handleRequstError = function (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else if (error.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.log(error.request);
          } else {
            // Something happened in setting up the request that triggered an Error
            console.log('Error', error.message);
          }
          console.log(error.config);

          res.set('Content-Type', 'text/html')
          res.status(502);
          res.send(Buffer.from('<center><h1>502 Bad Gateway</h1></center>'))
    }
  
    next();
  })
  

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


app.get('/fact', async (req, res) => {

    const response = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random')
        .then(function (response) {
            if (response.data.hasOwnProperty('text')){
                const text = response.data.text;
                res.status(200).send(text);
            } else{
                console.log('GET response from https://uselessfacts.jsph.pl/api/v2/facts/random has no propierty text')
                res.set('Content-Type', 'text/html')
                res.status(502);
                res.send(Buffer.from('<center><h1>502 Bad Gateway</h1></center>'))
            }
        })
        .catch(function (error) {
            res.handleRequstError(error);
      })
    
})


app.listen(3000)