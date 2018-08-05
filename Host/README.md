- create image with create-rpi3-base-image.sh
- boot from image

update pacman keyring

```sh
pacman-key --init
pacman-key --populate archlinuxarm
```

install ansible

```sh
pacman -S ansible
```

apply setup

```sh
ansible-playbook -i inventory ngcnc.yml
```
