// Create and read project lists
const fs = require('fs');

class ProjectGenerationService {
    constructor(ec2Base ="", filename="ec2List.csv") {
        this.ec2BaseUrl = ec2Base;
        this.file = filename;
    }

    saveToCSV(projectName, port) {
        const csv = `${projectName},${this.ec2BaseUrl}:${port}\n`;
        try {
            fs.appendFileSync(`./${filename}`, csv);
        } catch(err) {
            console.error('Err with saving to CSV: ', err)
        }
    }

    readCSV() {
        try {
            const data = fs.readFileSync(`./${filename}`, 'utf8');

            return data;
        } catch (err) {
            console.log('Error with reading CSV: ', err)
        }
    }
}

module.exports = { 
    ProjectGenerationService 
}