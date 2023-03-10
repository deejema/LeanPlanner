const express = require('express');
const http = require('http');
const bcrypt = require('bcrypt');
const path = require('path');
const bodyParser = require('body-parser');
const users = require('./data').userDB;
const config = require('./config').config;
const fs = require('fs');

const app = express();
const server = http.createServer(app);
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, './public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './public/index.html'));
})

app.post('/register', async(req, res)=> {
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
    try{ 
        let foundUser = users.find((data) => req.body.username === data.username);
        
        if (foundUser) {
            // Check for password match
            let submittedPass = req.body.password;
            let storedPass = foundUser.password;

            const passwordMatch = await bcrypt.compare(submittedPass, storedPass);
            if (passwordMatch) {
                let userName = foundUser.username;

                res.send(`
                <div align ='center'>
                    <h2>Login successful</h2>
                </div>
                <br><br><br>
                <div align ='center'>
                    <h3>Hello ${userName}</h3>
                </div>
                <br><br>
                <div align='center'>
                    <a href='./login.html'>logout</a>
                </div>`);
                res.sendFile()
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

server.listen(config.port, function() {
    console.log('Server is listening on port: ', config.port)
})