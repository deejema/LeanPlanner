// Create and read project lists
const { error } = require('console');
const fs = require('fs');

class ProjectGenerationService {
    constructor(ec2Base ="", filename="ec2List.csv", firstProjectPort, maxProjectPort) {
        this.ec2BaseUrl = ec2Base;
        this.file = filename;
        this.firstProjectPort = firstProjectPort;
        this.maxProjectPort = maxProjectPort;
        this.projects = {};
        let projects = this.readCSV();
        console.log(projects, 'projects');
        
        let processedData = projects.split('\n');
        console.log('processedData1', processedData)
        processedData.forEach((line) => {
            if (line === '') { return ''}
            let project = line.split(',');
            let port = line.split(',')[1].split(':')[1]; // Should be getting port from URL
            console.log('project/port', project, port);
            this.projects[port] = project[0];    
        })
        console.log(this.projects)
    }

    saveToCSV(projectName) {
        let port = this.firstProjectPort;
        try {
            while (port <= this.maxProjectPort) {
                if (this.projects[port]) {
                    console.log('Port Taken: ', port)
                } else {
                    const csv = `${projectName},${this.ec2BaseUrl}:${port}\n`;
                    fs.appendFileSync(`./${this.file}`, csv);
                    this.projects[port] = projectName;
                    
                    // Make script for post file upload
                    const projectDirectory = `/home/ubuntu/Lean/Projects/${projectName}/`
                    const script = `echo Copying ForgeTemplate to Folder: ${projectName} 
                    cp -r /home/ubuntu//Lean/ForgeTemplate/ ${projectDirectory}
                    mv /home/ubuntu/.env ${projectDirectory} 
                    mv /home/ubuntu/urns.js ${projectDirectory}wwwroot
                    cd
                    ./.nvm/versions/node/v14.16.0/bin/pm2 start server.js`;
                    fs.writeFileSync('scriptToForge', script);
                    return port;
                }// NOTE: pm2 called from hidden folder because lambda
                port+=1;
            }
            if (port > this.maxProjectPort) {
                throw new Error("Unable to add more projects, contact admin");
            }
        } catch(err) {
            console.error('Err with saving to CSV: ', err)
        }
    }

    readCSV() {
        try {
            const data = fs.readFileSync(`./${this.file}`, 'utf8');

            return data;
        } catch (err) {
            fs.appendFileSync(`./${this.file}`, '');
            console.log('Error with reading CSV: ', err)
        }
    }

    getProjects() {
        return this.projects;
    }
}

module.exports = { 
    ProjectGenerationService 
}