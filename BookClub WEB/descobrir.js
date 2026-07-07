let generoSelecionado = "todos";
let termoPesquisa = "";

window.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem("bookclub_current_user"));
    if (!user) { window.location.href = "login.html"; return; }
    document.getElementById('discover-avatar').src = user.avatar;

    window.filterGenre = (g, btn) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        generoSelecionado = g;
        renderDiscover();
    };

    document.getElementById('discover-search').addEventListener('input', (e) => {
        termoPesquisa = e.target.value.toLowerCase().trim();
        renderDiscover();
    });

    window.renderDiscover = () => {
        const container = document.getElementById('discover-display-results');
        // Pega a lista atualizada (padrões + customizados)
        let lista = Object.values(ACERVO_LIVROS);

        if (generoSelecionado !== "todos") {
            lista = lista.filter(b => b.genre === generoSelecionado);
        }
        if (termoPesquisa !== "") {
            lista = lista.filter(b => b.title.toLowerCase().includes(termoPesquisa) || b.author.toLowerCase().includes(termoPesquisa));
        }

        container.innerHTML = lista.map(b => `
            <div class="book-card" onclick="openBookModal('${b.id}')">
                <img src="${b.cover || 'https://via.placeholder.com/145x210?text=Sem+Capa'}">
                <div class="book-details">
                    <h4>${b.title}</h4>
                    <p>${b.author}</p>
                </div>
            </div>
        `).join('');
    };

    // --- Funções de Controle do Modal de Cadastro ---
    window.openAddBookModal = () => {
        document.getElementById('add-book-modal').classList.remove('hidden');
    };

    window.closeAddBookModal = () => {
        document.getElementById('add-book-modal').classList.add('hidden');
        document.getElementById('form-add-book').reset();
    };

    // Evento de Envio do Formulário
    document.getElementById('form-add-book').addEventListener('submit', function(e) {
        e.preventDefault();

        const title = document.getElementById('add-title').value.trim();
        const author = document.getElementById('add-author').value.trim();
        const genre = document.getElementById('add-genre').value;
        const releaseDate = document.getElementById('add-date').value;
        const pages = parseInt(document.getElementById('add-pages').value);
        let cover = document.getElementById('add-cover').value.trim();
        const synopsis = document.getElementById('add-synopsis').value.trim();

        // Se não colocar capa, gera um placeholder visual
        if (!cover) {
            cover = `https://via.placeholder.com/145x210?text=${encodeURIComponent(title)}`;
        }

        // Cria um ID único baseado no título (ex: "O Jogo da Alma" vira "o-jogo-da-alma")
        const id = title.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
            .replace(/[^a-z0-9\s-]/g, "") // remove caracteres especiais
            .replace(/\s+/g, "-"); // troca espaços por hífen

        // Verifica se o ID já existe para não sobrepor
        if (ACERVO_LIVROS[id]) {
            alert("Já existe uma obra cadastrada com este título ou título muito similar!");
            return;
        }

        const novoLivro = { id, title, author, genre, releaseDate, pages, cover, synopsis };

        // Executa a função do livrosData.js
        cadastrarNovoLivro(novoLivro);

        alert(`"${title}" foi adicionado com sucesso ao catálogo!`);
        closeAddBookModal();
        renderDiscover(); // Recarrega a grade com o novo livro incluído
    });

    // Renderização Inicial
    renderDiscover();
});