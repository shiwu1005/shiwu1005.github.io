document.addEventListener('DOMContentLoaded', function() {
  if (typeof APlayer === 'undefined') return;

  fetch('/music/music.json')
    .then(res => res.json())
    .then(audioList => {
      new APlayer({
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