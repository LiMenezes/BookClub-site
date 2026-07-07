window.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem("bookclub_current_user"));
    if (!user) { window.location.href = "login.html"; return; }

    document.getElementById('home-display-name').innerText = user.name;
    document.getElementById('home-display-handle').innerText = `@${user.username}`;
    document.getElementById('home-avatar').src = user.avatar;

    const totalLidosFicticio = 4;
    document.getElementById('home-goal-text').innerText = `Você concluiu ${totalLidosFicticio} de ${user.target} obras planejadas.`;
    document.getElementById('home-goal-fill').style.width = `${(totalLidosFicticio / user.target) * 100}%`;

    window.refreshActivityFeed = () => {
        const todosComentarios = JSON.parse(localStorage.getItem('bookclub_comments')) || {};
        const feedContainer = document.getElementById('global-activity-feed');
        let htmlAcumulado = [];

        for (let livroId in todosComentarios) {
            todosComentarios[livroId].forEach(com => {
                htmlAcumulado.push(`
                    <div class="comment-bubble-item" style="cursor:pointer;" onclick="openBookModal('${livroId}')">
                        <img src="${com.avatar}" class="comment-avatar">
                        <div class="comment-payload">
                            <p style="font-size:0.9rem;"><strong>${com.name}</strong> avaliou <span style="color:var(--accent-blue); font-weight:600;">${com.bookTitle}</span> ${'★'.repeat(com.rating)}</p>
                            <p style="font-size:0.85rem; color:var(--text-muted); font-style:italic; margin-top:3px;">"${com.text}"</p>
                        </div>
                    </div>
                `);
            });
        }

        feedContainer.innerHTML = htmlAcumulado.length ? htmlAcumulado.reverse().slice(0, 5).join('') : `<p style="color:var(--text-muted); font-style:italic; font-size:0.9rem;">Nenhuma atividade recente no app.</p>`;
    };

    window.refreshActivityFeed();
});