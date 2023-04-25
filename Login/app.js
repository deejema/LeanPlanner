const express = require('express');
const http = require('http');
const bcrypt = require('bcrypt');
const path = require('path');
const bodyParser = require('body-parser');
const users = require('./data').userDB;
const config = require('./config').config;
const fileUpload = require('express-fileupload');
const {exec} = require('child_process');
exec("dir", (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
});
// Services
const ProjectGenerationService = require('./services/projects').ProjectGenerationService;

let projects = new ProjectGenerationService(config.urlBase, config.urlFiles);
console.log('csv', projects.readCSV());
const app = express();
const server = http.createServer(app);
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
                let data = projects.readCSV();
                // Process data
                let processedData1 = data.split('\n');
                console.log('processedData1', processedData1)
                let processedData = processedData1.map((line) => {
                    let stringsplit = line.split(',');
                    console.log('line', line, stringsplit);
                    if (line === '') { return ''}
                    return `<label> ${stringsplit[0]} </label> <a href="${stringsplit[1].trim()}">x</a><br>`
                })
                console.log(processedData);
                res.send(`
                <div align ='center'>
                    <h2>Login successful</h2>
                </div>
                <br><br><br>
                <div align ='center'>
                    <h3>Hello ${userName}</h3>
                    <div>
                    ${processedData}
                    </div>
                </div>
                <br><br>
                <div align='center'>

                <form method="POST" action="/upload" enctype="multipart/form-data">
                    <input type="file" name="myFile" />
                    <input type="submit" />
                </form>
                </div>
                <br><br>
                <div align='center'>
                    <a href='./login.html'>logout</a>
                </div>`);
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
    
    if (!req.files) {
        return res.status(400).send("No files were uploaded.");
      }
    const file = req.files.myFile;
    const path = __dirname + "/files/" + file.name;

    projects.saveToCSV(file.name, 1234);
    file.mv(path, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        return res.send({ status: "success", path: path });
    });
    console.log(file);
})
server.listen(config.port, function() {
    console.log('Server is listening on port: ', config.port)
})