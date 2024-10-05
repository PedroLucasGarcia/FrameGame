// Array de frames (imagens) do jogo
const frames = [
    "img/img1.png",
    "img/img2.png",
    "img/img3.png",
    "img/img4.png",
    "img/img5.png",
    "img/img6.png"
];

const movieList = [
    // Lista de filmes usados para sugestão de títulos
    "Um Sonho de Liberdade (1994)",
    "A Origem (2010)",
    "O Poderoso Chefão (1972)",
    "Pulp Fiction: Tempo de Violência (1994)",
    "Batman: O Cavaleiro das Trevas (2008)",
    "Forrest Gump: O Contador de Histórias (1994)",
    "Clube da Luta (1999)",
    "Matrix (1999)",
    "O Senhor dos Anéis: A Sociedade do Anel (2001)",
    "Gladiador (2000)",
    "Titanic (1997)",
    "O Silêncio dos Inocentes (1991)",
    "Jurassic Park: O Parque dos Dinossauros (1993)",
    "A Lista de Schindler (1993)",
    "O Rei Leão (1994)",
    "Star Wars: Uma Nova Esperança (1977)",
    "De Volta para o Futuro (1985)",
    "E.T.: O Extraterrestre (1982)",
    "O Exterminador do Futuro (1984)",
    "O Resgate do Soldado Ryan (1998)",
    "O Grande Lebowski (1998)",
    "Os Bons Companheiros (1990)",
    "Os Infiltrados (2006)",
    "Uma Mente Brilhante (2001)",
    "O Grande Truque (2006)",
    "Os Vingadores (2012)",
    "Avatar (2009)",
    "Seven - Os sete pecados capitais (1995)",
    "Coração Valente (1995)",
    "Interestelar (2014)",
    "Amnésia (2000)",
    "Os Suspeitos (1995)",
    "La La Land: Cantando Estações (2016)",
    "O Grande Hotel Budapeste (2014)",
    "Whiplash: Em Busca da Perfeição (2014)",
    "O Labirinto do Fauno (2006)",
    "Ela (2013)",
    "A Viagem de Chihiro (2001)",
    "Donnie Darko (2001)",
    "O Show de Truman: O Show da Vida (1998)",
    "Onde os Fracos Não Têm Vez (2007)",
    "Réquiem para um Sonho (2000)",
    "Moonlight: Sob a Luz do Luar (2016)",
    "12 Homens e uma Sentença (1957)",
    "À Espera de um Milagre (1999)",
    "Laranja Mecânica (1971)",
    "O Fabuloso Destino de Amélie Poulain (2001)",
    "Ilha do Medo (2010)",
    "A Rede Social (2010)",
    "Cidade de Deus (2002)",
    "Mad Max: Estrada da Fúria (2015)"
];

const movieInput = document.getElementById('movieName'); // Input onde o usuário digita o nome do filme
const suggestionsBox = document.getElementById('movie-suggestions'); // Div onde as sugestões de filmes serão exibidas
let currentFrame = 0; // Índice do frame atual

// Evento de input para exibir sugestões de filmes com base no texto digitado
movieInput.addEventListener('input', function() {
    const inputValue = movieInput.value.toLowerCase(); // Captura o valor do input em minúsculo
    suggestionsBox.innerHTML = ''; // Limpa as sugestões anteriores

    if (inputValue.length > 0) {
        // Filtra a lista de filmes com base no valor digitado
        const filteredMovies = movieList.filter(movie => movie.toLowerCase().includes(inputValue));

        // Cria e exibe cada sugestão filtrada
        filteredMovies.forEach(movie => {
            const suggestionItem = document.createElement('div');
            suggestionItem.textContent = movie;
            
            // Adiciona o filme ao campo de input ao clicar na sugestão
            suggestionItem.addEventListener('click', () => {
                movieInput.value = movie;
                suggestionsBox.innerHTML = ''; // Limpa as sugestões após a seleção
                suggestionsBox.style.display = 'none'; // Esconde a caixa de sugestões
            });
            suggestionsBox.appendChild(suggestionItem); // Adiciona a sugestão à caixa
        });

        // Mostra a caixa de sugestões se houver filmes filtrados
        suggestionsBox.style.display = filteredMovies.length > 0 ? 'block' : 'none';
    } else {
        // Esconde a caixa de sugestões se o input estiver vazio
        suggestionsBox.style.display = 'none';
    }
});

// Fecha a caixa de sugestões ao clicar fora dela
document.addEventListener('click', function(event) {
    if (!event.target.closest('.input-section')) {
        suggestionsBox.style.display = 'none'; // Esconde a caixa de sugestões se clicar fora
    }
});

// Número total de frames
const totalFrames = frames.length;

// Evento do botão de envio da resposta
document.getElementById('btnSubmit').addEventListener('click', () => {
    // Obtem a resposta do usuário e normaliza para lowercase
    const userAnswer = document.getElementById('movieName').value.trim().toLowerCase();

    // Elemento de feedback para o usuário
    const feedback = document.getElementById('feedBack');


    // Verifica se a resposta está correta
    if (userAnswer === correctAnswer.toLowerCase()) {
        // Se a resposta estiver correta, exibe feedback positivo e desativa o input e o botão
        feedback.textContent = "Parabéns, você acertou! O filme é: " + correctAnswer;
        feedback.style.color = "green";
        disableInput(); // Desativa o input e o botão após acerto
        nextLevel(); // Adicione essa linha para prosseguir para o próximo nível
    } else {
        // Se a resposta estiver errada, avança para o próximo frame e exibe feedback negativo
        currentFrame++; // Avança para o próximo frame em caso de erro
        if (currentFrame < totalFrames) {
            // Troca a imagem para o próximo frame
            document.getElementById('movieFrame').src = frames[currentFrame];
            feedback.textContent = "Resposta errada! Restão apenas " + --frames.length + " chance(s).";
            feedback.style.color = "red"; // Feedback negativo
            updateButtons(); // Atualiza o estado dos botões (caso seja necessário)
        } else {
            // Se o jogador errar todas as tentativas, exibe feedback final e desativa o input e o botão
            feedback.textContent = "Você perdeu! O filme correto era: " + correctAnswer;
            feedback.style.color = "red"; // Feedback final
            disableInput(); // Desativa o input e o botão após o fim do jogo
        }
    }
});

// Função para prosseguir para o próximo nível
function nextLevel() {
    // Código para prosseguir para o próximo nível
    document.getElementById('nextLevel').style.display = 'block'; // Exibe o botão de próximo nível
    // Inicialize o próximo nível aqui
}

// Função para atualizar os botões que mostram as fases dos frames
function updateButtons() {
    // Seleciona todos os botões com a classe 'frameFase'
    const buttons = document.querySelectorAll('.frameFase button');

    // Ativa o próximo botão baseado no índice do frame atual
    if (currentFrame < buttons.length) {
        buttons[currentFrame].disabled = false;
        buttons[currentFrame].style.display = 'inline-block'; // Exibe o botão
    }
}

// Funções para trocar a imagem para cada frame
function img1(){
    document.getElementById('movieFrame').src = "img/img1.png"
}
function img2(){
    document.getElementById('movieFrame').src = "img/img2.png"
}
function img3(){
    document.getElementById('movieFrame').src = "img/img3.png"
}
function img4(){
    document.getElementById('movieFrame').src = "img/img4.png"
}
function img5(){
    document.getElementById('movieFrame').src = "img/img5.png"
}
function img6(){
    document.getElementById('movieFrame').src = "img/img6.png"
}

// Seleciona o elemento de imagem e os botões de fase
const img = document.getElementById('movieFrame');
const frameFaseButtons = document.querySelectorAll('.frameFase button')

// Evento de load da imagem
img.addEventListener('load', () => {
    // Obtem o nome da imagem atual
    const currentImage = img.src;
    const imageName = currentImage.substring(currentImage.lastIndexOf('/') + 1);

    // Seleciona o botão correspondente à imagem atual
    const correspondingButton = document.querySelector(`.frameFase button[data-image="${imageName}"]`);

    // Desativa todos os botões e ativa apenas o botão correspondente à imagem atual
    frameFaseButtons.forEach((button) => {
        button.style.opacity = 0.5;
    });
    if (correspondingButton) {
        correspondingButton.style.opacity = 1;
    }
});

// Função para desativar o input e o botão de envio quando o jogo terminar
function disableInput() {
    document.getElementById('movieName').disabled = true; // Desativa o campo de input
    document.getElementById('btnSubmit').disabled = true; // Desativa o botão de envio
}