document.addEventListener('DOMContentLoaded', function() {
  if (typeof APlayer === 'undefined') return;

  fetch('/music/music.json')
    .then(res => res.json())
    .then(audioList => {
      // 挂到 window 上，看板娘（Ash 小屋）才能控制播放器：切歌、暂停、调音量
      window.ap = new APlayer({
        container: document.getElementById('aplayer'),
        fixed: true,
        mini: true,
        autoplay: false,
        order: 'random',
        audio: audioList
      });
    })
    .catch(err => console.error('歌单加载失败', err));
});
