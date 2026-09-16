import Phaser from 'phaser';
import ArenaScene from './ArenaScene.js';
import { joinArena } from './net.js';
import { unlockAudio } from './audio.js';

const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const status = document.getElementById('loginStatus');
const login = document.getElementById('login');

nameInput.value = localStorage.getItem('chaosio_name') || '';
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

joinBtn.addEventListener('click', async () => {
  const name = (nameInput.value || 'لاعب').trim().slice(0, 16) || 'لاعب';
  localStorage.setItem('chaosio_name', name);
  unlockAudio(); // must happen inside this click gesture or mobile browsers block sound later
  joinBtn.disabled = true;
  status.textContent = 'جارٍ الاتصال بالساحة...';
  try {
    const room = await joinArena(name);
    login.style.display = 'none';
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#07060d',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add('arena', ArenaScene, true, { room });
  } catch (err) {
    console.error(err);
    status.textContent = 'تعذّر الاتصال بالخادم — تأكد أن السيرفر يعمل.';
    joinBtn.disabled = false;
  }
});
