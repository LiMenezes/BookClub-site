const LIVROS_PADRAO = {
    "a-empregada": {
        id: "a-empregada",
        title: "A Empregada",
        author: "Freida McFadden",
        genre: "Thriller Psicológico",
        releaseDate: "2022",
        pages: 336,
        cover: "https://i.pinimg.com/1200x/13/f4/86/13f48657d1b0e85835715c7571341ebe.jpg",
        synopsis: "Todos os dias Millie limpa a bela casa de Nina Winchester de cima a baixo. Ela leva a filha do casal na escola e cozinha para a família. Mas Millie não consegue deixar de notar as excentricidades de Nina e o clima tenso naquela casa. O problema é que Millie tem seus próprios segredos guardados a sete chaves..."
    },
    "o-segredo-da-empregada": {
        id: "o-segredo-da-empregada",
        title: "O Segredo da Empregada",
        author: "Freida McFadden",
        genre: "Thriller Psicológico",
        releaseDate: "2023",
        pages: 368,
        cover: "https://i.pinimg.com/736x/e2/7b/e0/e27be039f1c63d9449874c58b71e7fc9.jpg",
        synopsis: "Trancada no quarto de hóspedes, Millie sabe exatamente o que acontece atrás das portas fechadas da nova casa onde trabalha. Uma continuação eletrizante repleta de mentiras, reviravoltas chocantes e segredos perigosos."
    },
    "a-paciente-silenciosa": {
        id: "a-paciente-silenciosa",
        title: "A Paciente Silenciosa",
        author: "Alex Michaelides",
        genre: "Suspense",
        releaseDate: "2019",
        pages: 320,
        cover: "https://i.pinimg.com/1200x/47/8a/ea/478aead75e365fabfdf43cf20b121988.jpg",
        synopsis: "Alicia Berenson tinha uma vida perfeita. Um dia, ela dá uma série de tiros no marido e nunca mais profere uma única palavra. O psicoterapeuta forense Theo Faber fica obcecado em fazê-la falar e descobrir o mistério por trás do silêncio."
    },
    "a-familia-perfeita": {
        id: "a-familia-perfeita",
        title: "A Família Perfeita",
        author: "Freida McFadden",
        genre: "Thriller Psicológico",
        releaseDate: "2020",
        pages: 312,
        cover: "https://i.pinimg.com/1200x/3a/46/2c/3a462c0d139041ff158ecb3627260238.jpg",
        synopsis: "Uma família aparentemente perfeita esconde segredos perturbadores por trás de suas paredes impecáveis. Uma trama de ritmo acelerado que desafia tudo o que você acha que sabe."
    },
    "verity": {
        id: "verity",
        title: "Verity",
        author: "Colleen Hoover",
        genre: "Suspense",
        releaseDate: "2018",
        pages: 320,
        cover: "https://i.pinimg.com/736x/aa/07/4c/aa074c5197ad29feb79d98197e32e595.jpg",
        synopsis: "Lowen Ashleigh ganha a chance de uma vida ao ser contratada para terminar os livros de Verity Crawford. Na antiga casa da autora, Lowen encontra uma autobiografia oculta chocante."
    }
};

// Se você já trocou as URLs das capas acima no seu arquivo local, pode manter as suas URLs!

// Inicializa o armazenamento de livros customizados se não existir
if (!localStorage.getItem('bookclub_custom_books')) {
    localStorage.setItem('bookclub_custom_books', JSON.stringify({}));
}

// Junta os livros padrão com os criados dinamicamente
const obterAcervoCompleto = () => {
    const customBooks = JSON.parse(localStorage.getItem('bookclub_custom_books')) || {};
    return { ...LIVROS_PADRAO, ...customBooks };
};

// DECLARAÇÃO ÚNICA: Cria a variável global que o resto do app vai usar
let ACERVO_LIVROS = obterAcervoCompleto();

// Função para cadastrar um novo livro
function cadastrarNovoLivro(novoLivro) {
    const customBooks = JSON.parse(localStorage.getItem('bookclub_custom_books')) || {};
    customBooks[novoLivro.id] = novoLivro;
    localStorage.setItem('bookclub_custom_books', JSON.stringify(customBooks));
    
    // Atualiza a variável global em tempo de execução para os outros scripts lerem na hora
    ACERVO_LIVROS = obterAcervoCompleto();
}

// ==========================================
// ESTRUTURA DO MODAL DE DETALHES E COMENTÁRIOS
// ==========================================
const MODAL_HTML = `
<div id="book-modal" class="modal hidden">
    <div class="modal-content">
        <button class="close-modal" onclick="closeBookModal()">&times;</button>
        <div class="modal-body-layout">
            <div class="modal-left">
                <img id="modal-cover" src="" alt="Capa">
                <div class="rating-box">
                    <p>Sua Nota:</p>
                    <div class="stars-rating" id="user-stars">
                        <i class="fa-star fa-regular" data-value="1"></i>
                        <i class="fa-star fa-regular" data-value="2"></i>
                        <i class="fa-star fa-regular" data-value="3"></i>
                        <i class="fa-star fa-regular" data-value="4"></i>
                        <i class="fa-star fa-regular" data-value="5"></i>
                    </div>
                </div>
            </div>
            <div class="modal-right">
                <h2 id="modal-title">-</h2>
                <p class="modal-author">Por <span id="modal-author">-</span></p>
                <div class="modal-tags">
                    <span id="modal-genre" class="tag">Gênero</span>
                    <span id="modal-date" class="tag">Ano</span>
                    <span id="modal-pages" class="tag">Páginas</span>
                </div>
                <h3>Sinopse</h3>
                <p id="modal-synopsis" class="synopsis-text">-</p>
                
                <hr class="modal-divider">
                
                <h3>Feed de Comentários / Chat do Livro</h3>
                <form id="comment-form" class="comment-input-area">
                    <input type="text" id="comment-text" placeholder="Escreva sua opinião sobre a obra..." required>
                    <button type="submit"><i class="fa-solid fa-paper-plane"></i></button>
                </form>
                <div id="comments-container" class="comments-list"></div>
            </div>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', MODAL_HTML);

let livroAtualId = "";
let notaAtual = 0;
let editandoComentarioId = null;

function openBookModal(idLivro) {
    livroAtualId = idLivro;
    const livro = ACERVO_LIVROS[idLivro];
    if (!livro) return;

    document.getElementById('modal-cover').src = livro.cover;
    document.getElementById('modal-title').innerText = livro.title;
    document.getElementById('modal-author').innerText = livro.author;
    document.getElementById('modal-genre').innerText = livro.genre;
    document.getElementById('modal-date').innerText = livro.releaseDate;
    document.getElementById('modal-pages').innerText = `${livro.pages} págs`;

    document.getElementById('book-modal').classList.remove('hidden');
    editandoComentarioId = null;
    document.getElementById('comment-text').value = "";
    loadCommentsAndStars();
}

function closeBookModal() {
    document.getElementById('book-modal').classList.add('hidden');
}

document.querySelectorAll('#user-stars i').forEach(star => {
    star.addEventListener('click', (e) => {
        notaAtual = parseInt(e.target.getAttribute('data-value'));
        highlightStars(notaAtual);
    });
});

function highlightStars(rating) {
    document.querySelectorAll('#user-stars i').forEach((star, index) => {
        if (index < rating) {
            star.classList.replace('fa-regular', 'fa-solid');
        } else {
            star.classList.replace('fa-solid', 'fa-regular');
        }
    });
}

function loadCommentsAndStars() {
    const todosComentarios = JSON.parse(localStorage.getItem('bookclub_comments')) || {};
    const comentariosDoLivro = todosComentarios[livroAtualId] || [];
    const currentUser = JSON.parse(localStorage.getItem('bookclub_current_user'));
    
    const meuComentario = comentariosDoLivro.find(c => c.username === currentUser.username);
    notaAtual = meuComentario ? meuComentario.rating : 0;
    highlightStars(notaAtual);

    const container = document.getElementById('comments-container');
    container.innerHTML = comentariosDoLivro.length ? comentariosDoLivro.map(c => `
        <div class="comment-bubble-item ${c.username === currentUser.username ? 'mine' : ''}">
            <img src="${c.avatar}" class="comment-avatar">
            <div class="comment-payload">
                <div class="comment-meta">
                    <strong>${c.name} <span class="user-handle">@${c.username}</span></strong>
                    <span class="comment-stars">${'★'.repeat(c.rating || 0)}</span>
                </div>
                <p class="comment-body-text">${c.text}</p>
                ${c.username === currentUser.username ? `
                    <div class="comment-actions">
                        <span onclick="editComment('${c.id}', '${c.text}')"><i class="fa-solid fa-pen"></i> Editar</span>
                        <span onclick="deleteComment('${c.id}')" class="delete-action"><i class="fa-solid fa-trash"></i> Excluir</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('') : `<p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">Nenhum comentário ainda. Comece a conversa!</p>`;
}

document.getElementById('comment-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const txtInput = document.getElementById('comment-text');
    const currentUser = JSON.parse(localStorage.getItem('bookclub_current_user'));
    const todosComentarios = JSON.parse(localStorage.getItem('bookclub_comments')) || {};
    
    if (!todosComentarios[livroAtualId]) todosComentarios[livroAtualId] = [];

    if (editandoComentarioId) {
        const idx = todosComentarios[livroAtualId].findIndex(c => c.id === editandoComentarioId);
        if (idx !== -1) {
            todosComentarios[livroAtualId][idx].text = txtInput.value;
            todosComentarios[livroAtualId][idx].rating = notaAtual;
        }
        editandoComentarioId = null;
    } else {
        todosComentarios[livroAtualId].push({
            id: 'c_' + Date.now(),
            username: currentUser.username,
            name: currentUser.name,
            avatar: currentUser.avatar,
            text: txtInput.value,
            rating: notaAtual,
            timestamp: new Date().toLocaleDateString('pt-BR'),
            bookTitle: ACERVO_LIVROS[livroAtualId].title
        });
    }

    localStorage.setItem('bookclub_comments', JSON.stringify(todosComentarios));
    txtInput.value = "";
    loadCommentsAndStars();
    if(window.refreshActivityFeed) window.refreshActivityFeed();
});

function editComment(id, texto) {
    editandoComentarioId = id;
    document.getElementById('comment-text').value = texto;
    document.getElementById('comment-text').focus();
}

function deleteComment(id) {
    if (confirm("Deseja apagar esse comentário?")) {
        const todosComentarios = JSON.parse(localStorage.getItem('bookclub_comments')) || {};
        todosComentarios[livroAtualId] = todosComentarios[livroAtualId].filter(c => c.id !== id);
        localStorage.setItem('bookclub_comments', JSON.stringify(todosComentarios));
        loadCommentsAndStars();
        if(window.refreshActivityFeed) window.refreshActivityFeed();
    }
}

function logout() {
    localStorage.removeItem("bookclub_current_user");
    window.location.href = "login.html";
}