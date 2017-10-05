/*
 *  @license
 *    Copyright 2017 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

"use strict";

const zlib = require('zlib');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const MultiSet = require('mnemonist/multi-set');
const {URL} = require('url');
const aws = require('aws-sdk');
const Duplex = require('stream').Duplex;

const S3 = new aws.S3();

const useragent = require('useragent');
useragent(true);

const directive = /^#(.*?):\s*([^\s].*)/;

exports.handler = function(event, context, callback) {
    go().then(() => callback(null, null))
        .catch(err => callback(err));
};


async function go() {
    let agents = new MultiSet();
    let referrers = new MultiSet();
    let paths = new MultiSet();

    let oldTheme = new MultiSet();

    let files = (await listFiles()).map(it => it.Key);

    // let files = await fs.readdir('logs');
    // files = files.filter(it => it.includes('2017-09-27-13'));

    let logged = [];
    await batch(files, procs, it => {
        console.log('parsing', it);
        return process(it, entry => {
            // if (!logged) {
            //     logged = entry;
            // }
            // logged.push(entry)
            let ua = entry['cs(User-Agent)'];
            let parsed = useragent.parse(ua);
            // agents.add(`${parsed.family} ${parsed.major}`, 1);
            agents.add(parsed.family, 1);

            let requested = entry['cs-uri-stem'];
            paths.add(requested, 1);


            let referer = entry['cs(Referer)'];
            if (referer && referer !== '-') {
                let u = new URL(referer);
                referrers.add(u.hostname, 1);

                if (requested === '/2017-core-components/latest/2017-core-components.min.js') {
                    oldTheme.add(referer, 1)
                }
            }
            // }).then(entries => {
            //     allEntries = allEntries.concat(entries);
        });
    });

    // await fs.writeJson('all-entries.json', allEntries);

    console.log('---------- User Agents -------------');
    logSet(agents);

    console.log('---------- Referrer -------------');
    logSet(referrers);

    console.log('---------- Paths -------------');
    logSet(paths);

    console.log('---------- Old Theme -------------');
    logSet(oldTheme);

    console.log('size', agents.size);
    console.log(logged);
}

function logSet(set) {
    sortedCount(set).forEach(it => {
        let pct = String(it.count * 100 / set.size).substr(0, 5);

        console.log(`${it.count}\t${it.value}\t${pct}%`)
    });

}

function sortedCount(set) {
    return [...set.multiplicities()].map(([value, count]) => {
        return {value, count}
    }).sort((left, right) => {
        return right.count - left.count;
    });
}

function getObject(key) {
    var params = {
        Bucket: 'cdn.byu.edu-logs',
        Key: key,
    };
    return S3.getObject(params).promise().then(it => it.Body);
}

async function process(file, processor) {
    let contents = await getObject(file);
    return new Promise((success, failure) => {
        let gunzip = zlib.createGunzip();
        // let stream = fs.createReadStream(file).pipe(gunzip);
        let stream = bufferToStream(contents).pipe(gunzip);

        let cols = [];

        let objects = [];

        let rl = readline.createInterface({
                input: stream,
                terminal: false
            })
                .on('close', () => success(objects))
                .on('error', failure)
                .on('line', procLine)
        ;

        function procLine(line) {
            let match = directive.exec(line);
            if (match) {
                if (match[1] === 'Fields') {
                    cols = match[2].split(/\s/);
                }
            } else {
                let obj = line.split(/\s/).reduce((agg, it, idx) => {
                    let col = cols[idx];
                    agg[col] = decodeURI(decodeURI(it));//Yeah, it's double-encoded.  Uggh.
                    return agg;
                }, {});
                // objects.push(obj);
                processor(obj);
            }
        }
    });
}
function bufferToStream(buffer) {
    let stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

const procs = require('os').cpus().length;

async function batch(items, parallelism, action) {
    for (let chunk of chunkArray(items, parallelism)) {
        await Promise.all(
            chunk.map(action)
        );
    }
}

function chunkArray(array, chunkSize) {
    let result = [];

    for (let i = 0; i < array.length; i += chunkSize) {
        let chunk = array.slice(i, i + chunkSize);
        result.push(chunk);
    }

    return result;
}

async function listFiles() {
    let list = [];
    let token = null;

    do {
        let params = {
            Bucket: 'cdn.byu.edu-logs', /* required */
            ContinuationToken: token,
            MaxKeys: 1000,
            Prefix: 'E31YS2MO04RYWQ.2017-05-13',
        };
        let result = await S3.listObjectsV2(params).promise();

        token = result.NextContinuationToken;

        list = list.concat(result.Contents);
    } while (token);
    return list;
}
