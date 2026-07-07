window.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem("bookclub_current_user"));
    if (!user) { window.location.href = "login.html"; return; }

    function syncProfileDOM() {
        document.getElementById('p-card-name').innerText = user.name;
        document.getElementById('p-card-handle').innerText = `@${user.username}`;
        document.getElementById('p-card-avatar').src = user.avatar;
        document.getElementById('p-card-bio').innerText = user.bio;

        document.getElementById('edit-name').value = user.name;
        document.getElementById('edit-avatar').value = user.avatar === "avatar_padrao.jpg" ? "" : user.avatar;
        document.getElementById('edit-bio').value = user.bio;
        document.getElementById('edit-genre').value = user.genre;
        document.getElementById('edit-target').value = user.target;
    }

    function renderUserTimeline() {
        const todosComentarios = JSON.parse(localStorage.getItem('bookclub_comments')) || {};
        const timelineContainer = document.getElementById('p-timeline');
        let meusComentarios = [];

        for (let livroId in todosComentarios) {
            todosComentarios[livroId].forEach(c => {
                if (c.username === user.username) {
                    meusComentarios.push({ ...c, livroId });
                }
            });
        }

        timelineContainer.innerHTML = meusComentarios.length ? meusComentarios.reverse().map(c => `
            <div class="timeline-item">
                <span style="font-size:0.75rem; color:var(--text-muted); float:right;">${c.timestamp || ''}</span>
                <h4 style="font-size:0.9rem; color:white;">Avaliou <span style="color:var(--accent-blue); cursor:pointer;" onclick="openBookModal('${c.livroId}')">${c.bookTitle}</span></h4>
                <p style="color:#fbbf24; font-size:0.8rem; margin:2px 0;">${'★'.repeat(c.rating)}</p>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">"${c.text}"</p>
            </div>
        `).join('') : `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">Você ainda não fez nenhuma avaliação de livros.</p>`;
    }

    document.getElementById('form-edit-profile').addEventListener('submit', function(e) {
        e.preventDefault();
        
        user.name = document.getElementById('edit-name').value.trim();
        const inputAv = document.getElementById('edit-avatar').value.trim();
        user.avatar = inputAv !== "" ? inputAv : "avatar_padrao.jpg";
        user.bio = document.getElementById('edit-bio').value.trim();
        user.genre = document.getElementById('edit-genre').value.trim();
        user.target = parseInt(document.getElementById('edit-target').value) || 10;

        const users = JSON.parse(localStorage.getItem('bookclub_users')) || {};
        users[user.username] = user;
        localStorage.setItem('bookclub_users', JSON.stringify(users));
        localStorage.setItem("bookclub_current_user", JSON.stringify(user));

        alert("Alterações salvas com sucesso!");
        syncProfileDOM();
        renderUserTimeline();
    });

    syncProfileDOM();
    renderUserTimeline();
});