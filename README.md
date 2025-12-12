# picframe
Digital picture frame

Setup on raspberry pi (assuming hostname picframe and user admin)
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

# edit /etc/lightdm/lightdm.conf to autologin in user (admin)
sudo nano /etc/lightdm/lightdm.conf
# allow node to use port 80
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node

# setup systemd service
cd /etc/systemd/system
sudo ln -s /home/admin/picframe/picframe.service picframe.service
cd ~/picframe

# enable xserver authority
touch ~/.Xauthority
xauth generate :0 . trusted

# keep display from sleeping
DISPLAY=:0 xset s 0

#enable and start services
sudo systemctl enable lightdm
sudo systemctl enable picframe

# time to reboot
sudo reboot

```
