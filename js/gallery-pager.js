(function () {
  const PER_PAGE = 6; // 每页显示几张
  const gallery = document.getElementById('my-gallery');
  const pager = document.getElementById('my-gallery-pager');

  if (!gallery || !pager) return;

  const imgs = Array.from(gallery.querySelectorAll('img'));
  const totalPages = Math.ceil(imgs.length / PER_PAGE);

  // 只有超过一页才显示分页
  if (totalPages <= 1) return;

  let current = 1;

  function render(page) {
    current = page;

    imgs.forEach((img, i) => {
      const inPage = i >= (page - 1) * PER_PAGE && i < page * PER_PAGE;
      img.style.display = inPage ? '' : 'none';
    });

    // 生成分页按钮
    pager.innerHTML = '';

    // 上一页
    const prev = document.createElement('button');
    prev.textContent = '‹';
    prev.disabled = page === 1;
    prev.onclick = () => render(page - 1);
    pager.appendChild(prev);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      if (i === page) btn.classList.add('active');
      btn.onclick = () => render(i);
      pager.appendChild(btn);
    }

    // 下一页
    const next = document.createElement('button');
    next.textContent = '›';
    next.disabled = page === totalPages;
    next.onclick = () => render(page + 1);
    pager.appendChild(next);

    // 回到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  render(1);
})();