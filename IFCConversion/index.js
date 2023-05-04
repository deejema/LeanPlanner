const { spawn } = require("child_process");
const config = require('./config').config;
const fs = require('fs');
const path = require('path')
const request = require('request');
const qs = require('querystring')

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
console.log(config.client_id, config.client_secret);
if (!config.client_id || !config.client_secret) {
    console.log('No client id or secret detected');
    return;
}
let configurations = {}; // Used to keep track of additional config

// Run ICC to GLB Converter
// console.log(`Running ICC to GLB Conversion BAT file`)
// const ls = spawn("ICC_to_GLB", [], {shell:true});
console.log('Running IFC TO GLB SCRIPT');
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

ls.on("close", code => {
    console.log(`child process exited with code ${code}`);

    console.log('upload GLB here')

    //// Find all GLBs in directory
    let files = fromDir('./', /\.glb$/, function(filename) {
        console.log('-- found: ', filename);
    });
    console.log(files);

    // Get Access Token from authentication    
    let url = 'https://developer.api.autodesk.com/authentication/v1/authenticate';
    let requestOptions = {
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
    getAccessToken(url, requestOptions, files);

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
            // callback(filename);
        }
    };
    return filelist
};

function getAccessToken(url, requestOptions, files) {
    request(url, requestOptions, function(err, res) {
        if (err) console.log(err);
        try {
            let bodyjson = JSON.parse(res.body);
            configurations.access_token = bodyjson.access_token;
            const access_token = bodyjson.access_token;
            console.log('Got Access Token', access_token)

            // Set up create bucket function
            let url = 'https://developer.api.autodesk.com/oss/v2/buckets';
            let bucket = files[0].replace(/\s/g, '').replace('.glb', '');
            configurations.floorDataTable = bucket;
            bucket = bucket.toLowerCase()
            configurations.bucketKey = bucket;
            let requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${access_token}`
                },
                body: JSON.stringify({
                    bucketKey: bucket,
                    access:'full',
                    policyKey: 'persistent'
                })
            }
            console.log(requestOptions);
            createBucket(url, requestOptions, files);
        } catch (e) {
            console.log('GetAccessToken - ', e);
        }
    });
}

function createBucket(url, requestOptions, files) {    
    console.log('createBucket');
    request(url, requestOptions, function(err, res) {
    if (err) console.log(err);
    try {
        let options = JSON.parse(res.body);
        console.log(options);


        // Set up upload file
        let url = `https://developer.api.autodesk.com/oss/v2/buckets/${configurations.bucketKey}/objects/${files[0]}`;
        let requestOptions = {
            method:'PUT',
            headers: {
                'Content-Type':'application/octet-stream',
                'Authorization': `Bearer ${configurations.access_token}`
            },
            body: fs.createReadStream(__dirname + '\\' + files[0])
        }
        uploadFile(url, requestOptions, files[0]);
    } catch (e) {
        throw new Error('GetAccessToken - ', e);
    }
});
}

function uploadFile(url, requestOptions, file) {
    console.log('uploadFile')
    request(url, requestOptions, function(err, res) {
        if (err) console.log(err);
        try{
            let result = JSON.parse(res.body);
            console.log('uploadFile', result, result.objectId);

            // Translate job
            let encoded_urn = Buffer.from(result.objectId).toString('base64');
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
            translateFile(url, requestOptions, file)
        } catch (e) {
            console.log('Err: ', e)
        }
    });
}

function translateFile(url, requestOptions) {
    console.log('translateFile')
    request(url, requestOptions, function (err, res) {
        if (err) console.log(err);
        try {
            let result = JSON.parse(res.body);
            console.log(result);

            let url = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${result.urn}/manifest`;
            let requestOptions = {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${configurations.access_token}`
                }
            }
            checkStatusOfTranslation(url, requestOptions) 
        } catch (e) {
            console.log('translateFile: ', e)
        }
    });
}

function checkStatusOfTranslation(url, requestOptions) {
    request(url, requestOptions, function (err, res) {
        if (err) console.log(err);
        
        try {
            let result = JSON.parse(res.body);
            console.log(result);
            if (result.progress !== 'complete' ){
                checkStatusOfTranslation(url, requestOptions);
            } else {
                fs.writeFile('urns.txt', result.urn, (err) => {
                    if (err) console.log(err);
                    else {
                        console.log('written to urns.txt')
                    }
                })
                translateIFCToJson();
            }
        } catch (e) {
            console.log('checkStatus: ', e)
        }
    })
}

function translateIFCToJson() {
    let ifCfiles = fromDir('./', /\.ifc$/, function(filename) {
        console.log('-- found: ', filename);
    });
    ifCfiles.forEach(file => {
        ifcToJson(file, file.replace('.ifc', '.json'))
    })
}

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
        fs.copyFile('.env-TEMPLATE', '.env', err => {
            if (err) throw err;
            console.log('Copied template ENV to source');

            fs.readFile('.env', 'utf8', function(err, data) {
                if (err) {
                    return console.log(err);
                }
                console.log(data);
                console.log(config.client_id, config.client_secret, configurations.bucketKey)
                let result = data.replace('<FORGE_ID>', config.client_id);
                result = result.replace('<FORGE_SECRET>', config.client_secret);
                result = result.replace('<FORGE_BUCKET>', configurations.bucketKey);
                result = result.replace('<FORGE_FLOORDATA>', configurations.floorDataTable);
                result = result.replace('<FORGE_PORT>', '3500');
                console.log('res', result)
                fs.writeFile('.env', result, 'utf8', function(err) {
                    if (err) { console.log(err)}
                })
            })
        })
    })

}