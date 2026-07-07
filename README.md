# picframe
Digital picture frame

The companion web app, [Simple-Photo-Gallery](https://github.com/ron4mac/simple-photo-gallery) is used for the photo repository.

Setup on raspberry pi (assuming hostname picframe and user admin - change as appropriate)  
Start with Raspberry Pi OS lite (no desktop).
```
# download the picframe software package from github
wget "https://ron4mac@github.com/ron4mac/picframe/archive/main.zip"
unzip main.zip
mv picframe-main picframe
unlink main.zip

# install other needed software
sudo apt install nodejs
sudo apt install fbi

# allow node to use port 80
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node

# setup systemd services
modify picframe.service file as necessary for user/home
cd /etc/systemd/system
sudo ln -s /home/admin/picframe/cursor-off.service cursor-off.service
sudo ln -s /home/admin/picframe/picframe.service picframe.service
cd ~/picframe

# create file 'service_vars'
nano service_vars
# file Content ==========================================
#password to administer the picframe
ADMIN_PASSWORD="<password>"
#if hostname is not 'picframe' provide proper URL
#LOCAL_PICFRAME="http://picframedev.local"
# =======================================================

#enable and start services
sudo systemctl enable cursor-off
sudo systemctl enable picframe

# time to reboot
sudo reboot

```
