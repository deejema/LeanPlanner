1.) Install NVM and install correct versions (node 14.16.0, npm 6.14.11)
	https://tecadmin.net/how-to-install-nvm-on-ubuntu-22-04/
	
	***COMMANDS***
	sudo apt install curl 
	curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash 
	source ~/.profile 

	nvm install 14.16.0
	nvm use 14.16.0

2.) Install PM2 (used to automate restarting project instances)
	https://pm2.keymetrics.io/docs/usage/quick-start/
	
	***COMMANDS***
	npm install pm2@latest -g

3.) Create Directory and git clone iccforgedemo Repository

	***COMMANDS***
	mkdir Lean
	cd Lean
	https:/git clone /github.com/deejema/iccforgedemo.git
	mv iccforgedemo/ ForgeTemplate/
	cd ForgeTemplate/
	npm install

4.) Git clone LeanPlan Repository
	
	***COMMANDS***
	git clone https://github.com/deejema/LeanPlanner.git

5.) Install dotnet 3.1 for instance for IFC to JSON conversion
	
	***COMMANDS***
	# Change Folder
	cd LeanPlanner/IFCConversion/

	#Install libssl1.1 forr dotnet 3.1
	echo "deb http://security.ubuntu.com/ubuntu focal-security main" | sudo tee /etc/apt/sources.list.d/focal-security.list
	sudo apt-get update
	sudo apt-get install libssl1.1
	sudo rm /etc/apt/sources.list.d/focal-security.list


	# Prepare dotnet runtime
	sudo apt update
	sudo apt install -y apt-transport-https ca-certificates wget software-properties-common
	wget https://packages.microsoft.com/config/ubuntu/21.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
	sudo dpkg -i packages-microsoft-prod.deb
	sudo add-apt-repository "$(wget -q -O - https://packages.microsoft.com/config/ubuntu/21.04/prod.list)"
	sudo apt update
	sudo apt install -y dotnet-runtime-3.1
	dotnet --list-runtimes


	# Download xeokit-metadata
	wget --quiet https://github.com/bimspot/xeokit-metadata/releases/download/1.0.0/xeokit-metadata-linux-x64.tar.gz
	tar -zxvf xeokit-metadata-linux-x64.tar.gz
	chmod +x xeokit-metadata-linux-x64/xeokit-metadata
	cd xeokit-metadata-linux-x64

6.) NPM Install ICCConversion and Login folders

7.) Change urlBase in Login/config.js
	THIS WILL SET ALL PROJECT URLS TO THE RIGHT INSTANCE
	
7.) PM2 start on Login Page
	
	***COMMANDS***
	cd /home/ubuntu/Lean/LeanPlanner/Login
	pm2 start app.js
	
8.) Add Forge client id and secret, aws credentials in IFCConversion/config.js

9.) SCP IFCConvert for Linux into IFCConversion/ Folder
	- Command to SCP (CHANGE INSTANCE IP AND PEM FILE):
		scp -i solibritest.pem IfcConvert ubuntu@3.235.92.162:~/
	
	***COMMANDS*** START AT HOME
	chmod 777 IfcConvert
	chmod 777 clearEverythingScript
	mv IFCConvert Lean/LeanPlanner/IFCConversion/
	
10.) Check if python3 is installed
	If so, check to make sure pip installed
	
	***COMMANDS***
	sudo apt install python3-pip
	pip install xmltodict
	pip install pymysql