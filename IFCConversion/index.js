const { spawn } = require("child_process");
const config = require('./config').config;
const fs = require('fs');
const path = require('path')
const request = require('request');
const qs = require('querystring');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    accessKeyId: config.awsAccessKey,
    secretAccessKey: config.awsSecretKey
});

/**
 * 1.) Run ICC to GLB Converter
 * 2.) After it's done, run apis to set up forge bucket
 * 3.) Upload GLB to Forge bucket
 * 4.) Translate GLB to forge bucket
 * 5.) Translate IFC to JSON afterwards
 * 6.) Copy .env file for forge demo from template
 * 7.) Replace variable placeholders with actual values
 * 8.) Move .env to correct folder
 */
const filetoDelete = []; // GLB/IFC
const pythonScriptFilesXml = []; // XML
const pythonScriptFilesJson = []; // JSON
console.log(config.client_id, config.client_secret);
if (!config.client_id || !config.client_secret) {
    console.log('No client id or secret detected');
    return;
}
let configurations = {}; // Used to keep track of additional config

// lambda script
// node index.js 3001 test3

if (process.argv.length && process.argv.length == 4) {
    configurations.port = process.argv[2]; // port
    configurations.floorDataTable = process.argv[3] // Project Name to look up floor data in RDS
    configurations.bucket = process.argv[3].toLowerCase(); // bucket for forge
}
// Run ICC to GLB Converter
// console.log(`Running ICC to GLB Conversion BAT file`)
// const ls = spawn("ICC_to_GLB", [], {shell:true});
console.log('Running IFC TO GLB/XML/JSON SCRIPT');
const ls = spawn("./scriptToGlb", [], {shell:true});
ls.stdout.on("data", data => {
    console.log(`stdout: ${data}`);
});

ls.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
});

ls.on('error', (error) => {
    console.log(`error: ${error.message}`);
});

ls.on("close", async code => {
    console.log(`child process exited with code ${code}`);

    console.log('upload GLB here')

    //// Find all GLBs in directory
    let files = fromDir('./', /\.glb$/, function(filename) {
        console.log('-- found: ', filename);
    });
    console.log(files);

    // Get Access Token from authentication    
    let tokenUrl = 'https://developer.api.autodesk.com/authentication/v1/authenticate';
    let tokenRequestOptions = {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',

        },
        body: qs.stringify({
            client_id: config.client_id,
            client_secret: config.client_secret,
            grant_type : 'client_credentials',
            scope: 'code:all data:write data:read bucket:create bucket:delete'
        })
    }
    let access = await getAccessToken(tokenUrl, tokenRequestOptions, files);
    console.log('access token: ', access)

    // Set up create bucket
    let createBucketUrl = 'https://developer.api.autodesk.com/oss/v2/buckets';
    // let bucket = files[0].replace(/\s/g, '').replace('.glb', '');
    // configurations.floorDataTable = bucket;
    // bucket = bucket.toLowerCase()
    // console.log('bucket name', bucket)
    // configurations.bucketKey = bucket;
    configurations.bucketKey = configurations.bucket;
    let bucketRequestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${access}`
        },
        body: JSON.stringify({
            bucketKey: configurations.bucket,
            access:'full',
            policyKey: 'persistent'
        })
    }
    let bucketStatus = await createBucket(createBucketUrl, bucketRequestOptions, files);
    console.log('bucket status: ', bucketStatus)

    // Consolidate all urns for project
    configurations.urns = [];

    // Upload each file to project bucket
    let filesProcessed = 0; // process each file

    files.forEach(async (file) => {
        let fileUploadurl = `https://developer.api.autodesk.com/oss/v2/buckets/${configurations.bucketKey}/objects/${file}`;
        let fileUploadrequestOptions = {
            method:'PUT',
            headers: {
                'Content-Type':'application/octet-stream',
                'Authorization': `Bearer ${configurations.access_token}`
            },
            body: fs.createReadStream(__dirname + '/' + file)
        }
        // console.log('file: ', fileUploadurl, fileUploadrequestOptions)
        let uploadedFile = await uploadFile(fileUploadurl, fileUploadrequestOptions)
        
        console.log('uploadFile 126', uploadedFile, uploadedFile.objectId);
          

        // Translate job
        let encoded_urn = Buffer.from(uploadedFile.objectId).toString('base64');
        let url = `https://developer.api.autodesk.com/modelderivative/v2/designdata/job`;
        let requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${configurations.access_token}`
            },
            body: JSON.stringify({
                input: { urn: encoded_urn },
                output: { 
                    destination: { 
                        region: 'us' 
                    },
                    formats: [{
                        type: 'svf',
                        views: ["2d", "3d"]
                    }]
                }
            })
        }
        let translation = await translateFile(url, requestOptions, file)
        console.log('translation ', translation)
        
        let checkStatusUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${translation.urn}/manifest`;
        let translationStatusOptions = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${configurations.access_token}`
            }
        }
        let progress = await checkStatusOfTranslation(checkStatusUrl, translationStatusOptions);
        while(progress !== 'complete') {
            progress = await checkStatusOfTranslation(checkStatusUrl, translationStatusOptions);
            // console.log('progress: ', progress);
        }
        configurations.urns.push(encoded_urn);
        console.log('urns: ', configurations.urns);

        filesProcessed++;
        // console.log('files processed: ', filesProcessed, ' ', files.length)
        if(filesProcessed === files.length) {
            console.log('174 urns', configurations);

            // Copy .env file from template
            fs.copyFile('.env-TEMPLATE', '.env', err => {
                if (err) throw err;
                console.log('Copied template ENV to source');
    
                fs.readFile('.env', 'utf8', function(err, data) {
                    if (err) {
                        return console.log(err);
                    }
                    // console.log(data);
                    // console.log(config.client_id, config.client_secret, configurations.bucketKey)
                    let result = data.replace('<FORGE_ID>', config.client_id);
                    result = result.replace('<FORGE_SECRET>', config.client_secret);
                    result = result.replace('<FORGE_BUCKET>', configurations.bucketKey);
                    result = result.replace('<FORGE_FLOORDATA>', configurations.floorDataTable);
                    result = result.replace('<FORGE_PORT>', configurations.port ? configurations.port : '3500');
                    // console.log('res', result)
                    filetoDelete.push('.env'); // ENV
                    fs.writeFile('.env', result, 'utf8', function(err) {
                        if (err) { console.log(err)}

                    })
                })
            })
            // Create urns.js
            fs.copyFile('urns.js-TEMPLATE', 'urns.js', err => {
                if (err) throw err;
                console.log('Copied template urns.js to source');

                fs.readFile('urns.js', 'utf8', function(err, data) {
                    if (err) {
                        return console.log(err);
                    }
                    let urnString = configurations.urns.join(',');
                    let resUrns = data.replace('<REPLACE_URN>', urnString);
                    console.log('res', resUrns)
                    filetoDelete.push('urns.js'); // URNS
                    fs.writeFile('urns.js', resUrns, 'utf8', function(err) {
                        if (err) { console.log(err)}
                    })
                })
                // Translate to json files
                // translateIFCToJson();
            })         
            
            let ifCfiles = fromDir('./', /\.ifc$/, function(filename) {
                console.log('-- found: ', filename);
            });
            // TODO: FIX MULTIPLE IFC FILES - THIS ONLY WORKS FOR ONE IFC 
            if (ifCfiles.length === 1) {
                console.log('228 - 1 IFC file found');
                ifCfiles.forEach(file => {
                    console.log('Replace file to json: ', file.replace('.ifc', '.json'));
                    pythonScriptFilesJson.push(file.replace('.ifc', '.json')); // JSON
                    console.log('filenames from json', filetoDelete, pythonScriptFilesJson)
                    // ifcToJson(file, file.replace('.ifc', '.json'))
                })
            }
            uploadToS3();
        }
    });        
    
});

function fromDir(startPath, filter, callback) {
    let filelist = [];
    //console.log('Starting from dir '+startPath+'/');

    if (!fs.existsSync(startPath)) {
        console.log("no dir ", startPath);
        return;
    }

    var files = fs.readdirSync(startPath);
    for (var i = 0; i < files.length; i++) {
        var filename = path.join(startPath, files[i]);
        var stat = fs.lstatSync(filename);
        if (stat.isDirectory()) {
            // fromDir(filename, filter, callback); //recurse
        } else if (filter.test(filename)) {
            console.log('filename', filename)
            filelist.push(filename);
            filetoDelete.push(filename); // IFC
            // callback(filename);
        }
    };
    return filelist
};

async function getAccessToken(url, requestOptions, files) {
    console.log('glb files', files);
    return new Promise((resolve, reject) => {
        files.forEach(file => {
            filetoDelete.push(file); // glb
            pythonScriptFilesXml.push(file.replace('.glb', '.xml'))
            pythonScriptFilesJson.push(file.replace('.glb', '.json'))
        })
        request(url, requestOptions, function(err, res) {
            if (err) reject('SOMETHING HAPPENED - ', err);
            try {
                let bodyjson = JSON.parse(res.body);
                configurations.access_token = bodyjson.access_token;
                const access_token = bodyjson.access_token;

                resolve(access_token);
            } catch (e) {
                console.log('GetAccessToken - ', e);
                reject('SOMETHING HAPPENED IN ACCESS TOKEN')
            }
        });

    })
}

async function createBucket(url, requestOptions) {    
    console.log('createBucket');
    return new Promise((resolve, reject) => {
        request(url, requestOptions, function(err, res) {
        if (err) reject('BUCKET ERROR - ', err);
        try {
            let options = JSON.parse(res.body);    
            resolve(options);

        } catch (e) {
            reject('BUCKET ERROR- ', e)
        }
    });

    })
}

async function uploadFile(url, requestOptions) {
    console.log('uploadFile')
    return new Promise((resolve, reject) => {
        request(url, requestOptions, function(err, res) {
            if (err) reject(err);
            try{
                let result = JSON.parse(res.body);
                resolve(result);

            } catch (e) {
                reject('Err: ', e)
            }
        });
    })
}

async function translateFile(url, requestOptions) {
    console.log('translateFile')
    return new Promise((resolve, reject) => {
        request(url, requestOptions, function (err, res) {
            if (err) reject(err);
            try {
                let result = JSON.parse(res.body);
                console.log(result);
                resolve(result);
            } catch (e) {
                reject('translateFile: ', e)
            }
        });
    })
}

function checkStatusOfTranslation(url, requestOptions) {
    return new Promise((resolve, reject) => {
        request(url, requestOptions, function (err, res) {
            if (err) reject(err);
            
            try {
                let result = JSON.parse(res.body);
                console.log(result);
                resolve(result.progress);
            } catch (e) {
                reject('checkStatus: ', e)
            }
        })
    })
}

// function translateIFCToJson() {
//     let ifCfiles = fromDir('./', /\.ifc$/, function(filename) {
//         console.log('-- found: ', filename);
//     });
//     // TODO: FIX MULTIPLE IFC FILES
//     ifCfiles.forEach(file => {
//         console.log('Replace file to json: ', file.replace('.ifc', '.json'));
//         pythonScriptFilesJson.push(file.replace('.ifc', '.json')); // JSON
//         console.log('filenames from json', filetoDelete, pythonScriptFilesJson)
//         ifcToJson(file, file.replace('.ifc', '.json'))
//     })
// }

function ifcToJson(file, fileOutput) {
    console.log(`Translating ${file} to ${fileOutput}`)
    // const cmdline = `xeokit-metadata ${file} ${fileOutput}`
    const cmdline = `./xeokit-metadata-linux-x64/xeokit-metadata ${file} ${fileOutput}`
    let cmd = spawn(cmdline, [], {shell:true});
    cmd.stdout.on("data", data => {
        console.log(`stdout: ${data}`);
    });

    cmd.stderr.on("data", data => {
        console.log(`stderr: ${data}`);
    });

    cmd.on('error', (error) => {
        console.log(`error: ${error.message}`);
    });
    cmd.on("close", code => {
        console.log(`child process exited with code ${code}`);

        // Copy .env file from template
        // fs.copyFile('.env-TEMPLATE', '.env', err => {
        //     if (err) throw err;
        //     console.log('Copied template ENV to source');

        //     fs.readFile('.env', 'utf8', function(err, data) {
        //         if (err) {
        //             return console.log(err);
        //         }
        //         console.log(data);
        //         console.log(config.client_id, config.client_secret, configurations.bucketKey)
        //         let result = data.replace('<FORGE_ID>', config.client_id);
        //         result = result.replace('<FORGE_SECRET>', config.client_secret);
        //         result = result.replace('<FORGE_BUCKET>', configurations.bucketKey);
        //         result = result.replace('<FORGE_FLOORDATA>', configurations.floorDataTable);
        //         result = result.replace('<FORGE_PORT>', configurations.port ? configurations.port : '3500');
        //         console.log('res', result)
        //         // filenames.push('.env'); // ENV
        //         fs.writeFile('.env', result, 'utf8', function(err) {
        //             if (err) { console.log(err)}
                    
                    uploadToS3();
        //         })
        //     })
        // })
    })

}

async function uploadToS3() {

    // Upload GLB and project config files to S3
    filetoDelete.forEach(file => {
        if (file.includes('.ifc.glb') || file === '.env' || file === 'urns.js') {
            console.log('uploading: ', file)
            const body = fs.readFileSync(file);
            const params = {
                Bucket: config.awsBucket,
                Key: file,
                Body: body
            }
            s3.upload(params, (err, data) => {
                if (err) {
                    console.log(err);
                }
                console.log(data);
            })
        }

    })
    
    // PYTHON SCRIPT HERE THAT DEALS WITH XML AND JSON
    console.log('DO PYTHON SCRIPT HERE')

    // let pythonCmd = `python3 Parsing_XML_Data.py ${pythonScriptFilesXml[0]} ${pythonScriptFilesJson[0]} ${configurations.bucket}`
    let pythonCmd = `python3 Parsing_XML_Data.py [${pythonScriptFilesXml[0]}] [${pythonScriptFilesJson[0]}] ${configurations.bucket}`
    console.log('PYTHON COMMAND: ', pythonCmd)
    
    await sleep(5000);

    // await promiseCallCmd(pythonCmd, true);
    
    // Upload a trigger file so it can run the other files
    const params = {
        Bucket: config.awsBucket,
        Key: 'createProj.run',
        Body: ''
    }
    s3.upload(params, (err, data) => {
        if (err) {
            console.log(err);
        }
        console.log(data);
    })
    // await sleep(60000);
    // REMOVE ALL FILES (GLB, Config Files, XML, JSON)
    removeAllFiles();
}
async function callCmd(cmdline, removeFiles = false) {
    // return new Promise(resolve => {

        let cmd = spawn (cmdline, [], {shell:true});
        cmd.stdout.on("data", data => {
            console.log(`stdout: ${data}`);
        });
    
        cmd.stderr.on("data", data => {
            console.log(`stderr: ${data}`);
        });
    
        cmd.on('error', (error) => {
            console.log(`error: ${error.message}`);
        });
        cmd.on("close", code => {
            console.log(`child process exited with code ${code}`);
            // if (removeFiles) {
            //     removeAllFiles();
            // }
            // resolve(true);
        })
    // });
}
async function promiseCallCmd(cmdline) {
    return new Promise(resolve => {
        
        let cmd = spawn(cmdline, [], {shell:true});
        cmd.stdout.on("data", data => {
            console.log(`stdout: ${data}`);
        });
    
        cmd.stderr.on("data", data => {
            console.log(`stderr: ${data}`);
        });
    
        cmd.on('error', (error) => {
            console.log(`error: ${error.message}`);
        });
        cmd.on("close", code => {
            console.log(`promise call code ${code}`);
            resolve(true);
        })
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function removeAllFiles() {
    console.log('Removing all IFC, GLB, JSONs, URNS, ENV'); // MVP ONLY REMOVE GLB/IFC/JSON
    // callCmd('./scriptMoveConfigFiles'); // FOR MVP TO MOVE URNS AND ENV FILE, clear everything script will not delete env/urns cause it was moved due to this
    callCmd('./clearEverythingScript') // Just delete all any traces of XML/JSON/GLB/URNS.JS/.ENV if they exist
    console.log('files to upload', filetoDelete, pythonScriptFilesXml, pythonScriptFilesJson);
    filetoDelete.forEach(file => {
        const cmd = `rm ${file}`;
        console.log('cmd: ', cmd)
        callCmd(cmd);
    })  
    


    // pythonScriptFilesXml.forEach(file => {
    //     const cmd = `sudo rm ${file}`;
    //     console.log('cmd: ', cmd)
    //     callCmd(cmd);
    // })
    // pythonScriptFilesJson.forEach(file => {
    //     const cmd = `sudo rm ${file}`;
    //     console.log('cmd: ', cmd)
    //     callCmd(cmd);
    // })
    
}