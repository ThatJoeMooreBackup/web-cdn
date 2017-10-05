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

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

let go = (() => {
    var _ref = _asyncToGenerator(function* () {
        let agents = new MultiSet();
        let referrers = new MultiSet();
        let paths = new MultiSet();

        let oldTheme = new MultiSet();

        let files = (yield listFiles()).map(function (it) {
            return it.Key;
        });

        // let files = await fs.readdir('logs');
        // files = files.filter(it => it.includes('2017-09-27-13'));

        let logged = [];
        yield batch(files, procs, function (it) {
            console.log('parsing', it);
            return process(it, function (entry) {
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
                        oldTheme.add(referer, 1);
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
    });

    return function go() {
        return _ref.apply(this, arguments);
    };
})();

let process = (() => {
    var _ref4 = _asyncToGenerator(function* (file, processor) {
        let contents = yield getObject(file);
        return new Promise(function (success, failure) {
            let gunzip = zlib.createGunzip();
            // let stream = fs.createReadStream(file).pipe(gunzip);
            let stream = bufferToStream(contents).pipe(gunzip);

            let cols = [];

            let objects = [];

            let rl = readline.createInterface({
                input: stream,
                terminal: false
            }).on('close', function () {
                return success(objects);
            }).on('error', failure).on('line', procLine);

            function procLine(line) {
                let match = directive.exec(line);
                if (match) {
                    if (match[1] === 'Fields') {
                        cols = match[2].split(/\s/);
                    }
                } else {
                    let obj = line.split(/\s/).reduce((agg, it, idx) => {
                        let col = cols[idx];
                        agg[col] = decodeURI(decodeURI(it)); //Yeah, it's double-encoded.  Uggh.
                        return agg;
                    }, {});
                    // objects.push(obj);
                    processor(obj);
                }
            }
        });
    });

    return function process(_x, _x2) {
        return _ref4.apply(this, arguments);
    };
})();

let batch = (() => {
    var _ref5 = _asyncToGenerator(function* (items, parallelism, action) {
        for (let chunk of chunkArray(items, parallelism)) {
            yield Promise.all(chunk.map(action));
        }
    });

    return function batch(_x3, _x4, _x5) {
        return _ref5.apply(this, arguments);
    };
})();

let listFiles = (() => {
    var _ref6 = _asyncToGenerator(function* () {
        let list = [];
        let token = null;

        do {
            let params = {
                Bucket: 'cdn.byu.edu-logs', /* required */
                ContinuationToken: token,
                MaxKeys: 1000,
                Prefix: 'E31YS2MO04RYWQ.2017-05-13'
            };
            let result = yield S3.listObjectsV2(params).promise();

            token = result.NextContinuationToken;

            list = list.concat(result.Contents);
        } while (token);
        return list;
    });

    return function listFiles() {
        return _ref6.apply(this, arguments);
    };
})();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const zlib = require('zlib');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const MultiSet = require('mnemonist/multi-set');

var _require = require('url');

const URL = _require.URL;

const aws = require('aws-sdk');
const Duplex = require('stream').Duplex;

const S3 = new aws.S3();

const useragent = require('useragent');
useragent(true);

const directive = /^#(.*?):\s*([^\s].*)/;

exports.handler = function (event, context, callback) {
    go().then(() => callback(null, null)).catch(err => callback(err));
};

function logSet(set) {
    sortedCount(set).forEach(it => {
        let pct = String(it.count * 100 / set.size).substr(0, 5);

        console.log(`${it.count}\t${it.value}\t${pct}%`);
    });
}

function sortedCount(set) {
    return [].concat(_toConsumableArray(set.multiplicities())).map((_ref2) => {
        var _ref3 = _slicedToArray(_ref2, 2);

        let value = _ref3[0];
        let count = _ref3[1];

        return { value: value, count: count };
    }).sort((left, right) => {
        return right.count - left.count;
    });
}

function getObject(key) {
    var params = {
        Bucket: 'cdn.byu.edu-logs',
        Key: key
    };
    return S3.getObject(params).promise().then(it => it.Body);
}

function bufferToStream(buffer) {
    let stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

const procs = require('os').cpus().length;

function chunkArray(array, chunkSize) {
    let result = [];

    for (let i = 0; i < array.length; i += chunkSize) {
        let chunk = array.slice(i, i + chunkSize);
        result.push(chunk);
    }

    return result;
}
