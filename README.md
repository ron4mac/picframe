# picframe
Digital picture frame

The companion web app, [Simple-Photo-Gallery](https://github.com/ron4mac/simple-photo-gallery) is used for the photo repository.

Setup on raspberry pi (assuming hostname picframe and user admin - change as appropriate)
```
# download the picframe software package from github
wget "https://ron4mac@github.com/ron4mac/picframe/archive/main.zip"
unzip main.zip
mv picframe-main picframe
unlink main.zip

# install other needed software
sudo apt install nodejs
sudo apt install xserver-xorg xinit x11-xserver-utils
sudo apt install lightdm
sudo apt install feh

# edit /etc/lightdm/lightdm.conf to autologin in user (admin) and keep display on
sudo nano /etc/lightdm/lightdm.conf
to [Seat:*] section add:
autologin-user=admin
xserver-command=X -s 0

# allow node to use port 80
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node

# setup systemd service
modify picframe.service file as necessary for user/home
cd /etc/systemd/system
sudo ln -s /home/admin/picframe/picframe.service picframe.service
cd ~/picframe

# create file 'service_vars'
nano service_vars
# file Content ==========================================
XAUTHORITY=/home/admin/.Xauthority
ADMIN_PASSWORD="<password>"
#if hostname is not 'picframe' provide proper URL
#LOCAL_PICFRAME="http://picframedev.local"
# =======================================================

# enable xserver authority
touch ~/.Xauthority
xauth generate :0 . trusted

#enable and start services
sudo systemctl enable lightdm
sudo systemctl enable picframe

# time to reboot
sudo reboot

```
