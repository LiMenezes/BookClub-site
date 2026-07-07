window.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem("bookclub_current_user"));
    if (!user) { window.location.href = "login.html"; return; }
    document.getElementById('shelf-avatar').src = user.avatar;

    const meusLivrosIds = ["o-segredo-da-empregada", "a-empregada", "a-paciente-silenciosa"];

    function renderShelf(filterText = "") {
        const container = document.getElementById('shelf-display-results');
        
        const filtrados = meusLivrosIds.map(id => ACERVO_LIVROS[id]).filter(b => 
            b && (b.title.toLowerCase().includes(filterText) || b.author.toLowerCase().includes(filterText))
        );

        if(!filtrados.length) {
            container.innerHTML = `<p style="color:var(--text-muted); font-style:italic; padding:20px 0;">Nenhum livro encontrado.</p>`;
            return;
        }

        container.innerHTML = `
            <div class="books-grid">
                ${filtrados.map(b => `
                    <div class="book-card" onclick="openBookModal('${b.id}')">
                        <img src="${b.cover}">
                        <div class="book-details">
                            <h4>${b.title}</h4>
                            <p>${b.author}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    document.getElementById('shelf-search').addEventListener('input', (e) => {
        renderShelf(e.target.value.toLowerCase().trim());
    });

    renderShelf();
});