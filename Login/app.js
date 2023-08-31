const express = require('express');
const http = require('http');
const bcrypt = require('bcrypt');
const path = require('path');
const bodyParser = require('body-parser');
const users = require('./data').userDB;
const config = require('./config').config;
const fileUpload = require('express-fileupload');
const {exec} = require('child_process');
const AWS = require('aws-sdk');
const fs = require('fs');

exec("dir", (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    // console.log(`stdout: ${stdout}`);
});
// Services
const ProjectGenerationService = require('./services/projects').ProjectGenerationService;

let projects = new ProjectGenerationService(config.urlBase, config.urlFiles, config.firstProjectPort, config.maxProjectPort);


const app = express();
const server = http.createServer(app);

const s3 = new AWS.S3({
    accessKeyId: config.awsAccessKey,
    secretAccessKey: config.awsSecretKey
});



app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, './public')));
app.use(fileUpload());
app.get('/', (req, res) => {
    console.log('./ called')
    res.sendFile(path.join(__dirname, './public/index.html'));
})

app.post('/register', async(req, res)=> {
    console.log('register')
    try {
        let foundUser = users.find((data) => req.body.email === data.email);
        if (!foundUser) {
            let hashPassword = await bcrypt.hash(req.body.password, 10);
            let newUser = {
                id: Date.now(),
                username: req.body.username,
                email: req.body.email,
                password: hashPassword,
            };

            users.push(newUser);
            console.log('User List', users)
            res.send("<div align ='center'><h2>Registration successful</h2></div><br><br><div align='center'><a href='./login.html'>login</a></div><br><br><div align='center'><a href='./registration.html'>Register another user</a></div>");
        } else {
            res.send("<div align ='center'><h2>Email already used</h2></div><br><br><div align='center'><a href='./registration.html'>Register again</a></div>");
        }
    } catch {
        res.send("Internal Server Error");
    }
})

app.post('/login', async(req, res) => {
    console.log('login')
    try{ 
        let foundUser = users.find((data) => req.body.username === data.username);
        
        if (foundUser) {
            // Check for password match
            let submittedPass = req.body.password;
            let storedPass = foundUser.password;

            const passwordMatch = await bcrypt.compare(submittedPass, storedPass);
            if (passwordMatch) {
                let userName = foundUser.username;
                
                // Process data
                let resData = resDataForUser(userName);
                res.send(resData);
            } else {
                res.send("<div align ='center'><h2>Invalid email or password</h2></div><br><br><div align ='center'><a href='./login.html'>login again</a></div>");
            }
        } else {
            // Run a fake comparison so response time is similar to password mismatch so user can't detect whether username or password is wrong
            let fakePass = `$2b$$10$ifgfgfgfgfgfgfggfgfgfggggfgfgfga`;
            await bcrypt.compare(req.body.password, fakePass);
            res.send("<div align ='center'><h2>Invalid email or password</h2></div><br><br><div align='center'><a href='./login.html'>login again<a><div>");
        }
    } catch {
        res.send("Internal Server Error");
    }
})

app.post('/upload', async(req, res) => {
    console.log('upload');
    
    // console.log('req', req);

    if (!req.files) {
        return res.status(400).send("No files were uploaded.");
    }
    const files = req.files.myFile;
    const projectName = req.body.project;
    const path = __dirname + "/files/" + projectName;
    const username = req.body.username;
    console.log('files', files);
    console.log('path', path);

    let resData = resDataForUser(username); // Set up res data
    let port = projects.saveToCSV(projectName); // Create project first in CSV
    if (!port) { // Check to make sure port exists, if not, exit out
        res.send("NO MORE AVAILABLE PROJECT SPACE; CONTACT ADMIN");
    } else {
        let csvLine = `${projectName}, ${port}`; // Set up bucket info for IFC conversion
    
        // Upload files
        if (files.length && files.length > 0) {
            console.log('# of files', files.length);
            files.forEach(async file => {
                csvLine += ', ' + file.name;
                await uploadToS3(file);
            })
        } else {
            csvLine += ', ' + files.name;
            await uploadToS3(files);
        }
        const bucketInfo = {
            name: 'bucketInfo.txt',
            data: csvLine
        }
        
        await uploadToS3(bucketInfo)
    }


    


    // // Used for moving locally, only does single file so it'll break with more than one
    // file.mv(path, (err) => {
    //     if (err) {
    //         return res.status(500).send(err);
    //     }
        res.send(resData); // Uncomment this at all times, this sends the project list with updated stuffs
    //     // return res.send({ status: "success", path: path });
    // });
    // console.log('file: ', file);
})

async function uploadToS3(file) {
    const params = {
        Bucket: config.awsBucket,
        Key: file.name,
        Body: file.data
    }

    // console.log('params', params);
    s3.upload(params, (err, data) => {
        if (err) {
            console.log(err);
        }
        console.log(data.Location);
    })
}
server.listen(config.port, function() {
    console.log('Server is listening on port: ', config.port)
})

function processData() {
    let data = projects.getProjects();

    let processedData = [];
    if (Object.keys(data)) {
        Object.keys(data).forEach((key) => {
            processedData.push(`<label> ${data[key]} </label> <a href="${config.urlBase}:${key}">x</a><br>`)
        });
    }
    // let processedData1 = data.split('\n');
    // // console.log('processedData1', processedData1)
    // let processedData = processedData1.map((line) => {
    //     let stringsplit = line.split(',');
    //     // console.log('line', line, stringsplit);
    //     if (line === '') { return ''}
    //     return `<label> ${stringsplit[0]} </label> <a href="${stringsplit[1].trim()}">x</a><br>`
    // })

    return processedData;
}

function resDataForUser(userName) {
    let processedData = processData();
    console.log('processed data', processedData);
    return `
    <div align ='center'>
        <h2>Login successful</h2>
    </div>
    <br><br><br>
    <div align ='center'>
        <h3>Hello ${userName}</h3>
        <div>
        ${processedData.join('\n')}
        </div>
    </div>
    <br><br>
    <div align='center'>

    <form action="/upload" method="POST" enctype="multipart/form-data">
        <fieldset>
        <label for="project">Project Name: </label><input type="text" id="project" name="project" required />
        <input type="file" name="myFile" multiple/>
        <input type="text" id="username" name="username" placeholder="username" style="display:none" value="${userName}" required>
        <button type="submit">Submit</button>

        </fieldset>
    </form>
    </div>
    <br><br>
    <div align='center'>
        <a href='./login.html'>logout</a>
    </div>`
    
}