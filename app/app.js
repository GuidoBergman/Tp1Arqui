import {nanoid} from "nanoid"
import express from "express"
import axios from "axios"
import { createClient } from "redis"
import { XMLParser } from 'fast-xml-parser'
import { decode } from 'metar-decoder'
import rateLimit from 'express-rate-limit'
import {StatsD} from 'hot-shots'



const app = express();

const redisClient = createClient({url: 'redis://redis:6379'});
const parser = new XMLParser();
(async () => {
    await redisClient.connect();
})();

process.on('SIGTERM', async () => {
    await redisClient.quit();
});




var clientStatsD = new StatsD({
    host: 'graphite',
    port: 8125, 
    errorHandler: function (error) {
        console.log("Hot-shots error: ", error);
    }
});

const id = nanoid();

app.use((req, res, next) => {
    res.setHeader('API-id', id);
    next();
});

const limiter = rateLimit({
	windowMs: 10 * 1000, // 15 seconds
	max: 50, // Limit each IP to 100 requests per `window` (here, per 15 seconds)
	standardHeaders: true, 
	legacyHeaders: false, 
})

app.use(limiter)

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
  


app.get('/ping', async(req, res) => {
    var start_timestamp = Date.now();
   
    res.status(200).send('ping\n');

    var endpoint_response_time = Date.now() - start_timestamp;
    clientStatsD.timing('endpoint_response_time', endpoint_response_time);
})

app.get('/space_news', async (req, res) => {
    var start_timestamp = Date.now();
    let tittles;
    const tittlesString = await redisClient.get('space_news');

    if (tittlesString !== null){
        tittles = JSON.parse(tittlesString);
        res.status(200).send(tittles);
    } else {
        var remote_start_timestamp = Date.now();
        const response = await axios.get('https://api.spaceflightnewsapi.net/v3/articles?_limit=5')
        .then(async (response) => {    
            var remote_response_time = Date.now() - remote_start_timestamp;
            clientStatsD.timing('remote_response_time', remote_response_time);
            tittles = []
            response.data.forEach(element => {
                if (element.hasOwnProperty('title')){
                    tittles.push(element.title);
                }
            });
    
            await redisClient.set('space_news', JSON.stringify(tittles),{
                EX:5
            });
    
            res.status(200).send(tittles);
          })
          .catch((error) => {
            res.handleRequstError(error);
          })       
    }


    var endpoint_response_time = Date.now() - start_timestamp;
    clientStatsD.timing('endpoint_response_time', endpoint_response_time);
})


app.get('/fact', async (req, res) => {
    var start_timestamp = Date.now();
    const response = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random')
        .then(function (response) {
            var remote_response_time = Date.now() - start_timestamp;
            clientStatsD.timing('remote_response_time', remote_response_time);
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

    var endpoint_response_time = Date.now() - start_timestamp;
    clientStatsD.timing('endpoint_response_time', endpoint_response_time);
    
})

app.get('/metar', async (req, res) => {
    var start_timestamp = Date.now();
    const stationCode = req.query.station;

    if(stationCode.length !== 4){
        if(stationCode === ''){
            res.status(400).send('Parameters station is missing');
        }else{
            res.status(400).send('station must be on OACI format');
        }
    }else{
        var remote_start_timestamp = Date.now();
        await axios.get(`https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&stationString=${stationCode}&hoursBeforeNow=1`)
        .then(async (response) => {
            var remote_response_time = Date.now() - remote_start_timestamp;
            clientStatsD.timing('remote_response_time', remote_response_time);
            const parsed = parser.parse(response.data);
            if(parsed ===''){
                res.status(204).send('Not data found for this station');
            }else{
                const rawText = decode(parsed.response.data.METAR.raw_text);
                res.status(200).send(rawText);
            }            
          })
          .catch((error) => {
            res.handleRequstError(error);
          })
    }

    var endpoint_response_time = Date.now() - start_timestamp;
    clientStatsD.timing('endpoint_response_time', endpoint_response_time);
})

app.listen(3000)