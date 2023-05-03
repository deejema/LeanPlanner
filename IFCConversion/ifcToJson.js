const { spawn } = require("child_process");
const fs = require('fs');
const path = require('path')

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


