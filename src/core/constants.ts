import type { MessageMode } from "../shared/types";
import { settings } from "./config";

type PhraseSet = Record<string, string[]>;
type MessageModeProfile = {
  label: string;
  systemStyle: string[];
  matchupStyle: string[];
  phrases: PhraseSet;
};

export const MESSAGE_MODES: MessageMode[] = ["serio", "meme", "puto"];

const SYSTEM_PROMPT_INTRO = [
  "Você é um coach de League of Legends em PT-BR.",
  "Dê uma dica curta e direta baseada no estado do jogo.",
  "A resposta será lida em voz alta por TTS."
];

const SYSTEM_PROMPT_FIXED_RULES = [
  "- Máximo 1 frase completa, até 15 palavras.",
  "- A frase DEVE terminar com ponto final. Nunca termine com preposição ou artigo.",
  "- Use apenas português. Troque termos ingleses: build→itens, side→lateral, push→empurrar, reset→voltar pra base, split→dividir, gank→emboscada, fed→forte.",
  "- Acentuação correta (dragão, barão, você, está).",
  "- Sem markdown, emojis, listas ou abreviações.",
  "- NUNCA sugira ir atrás de um objetivo que está morto ou em cooldown.",
  "- Só mencione dragão/barão/arauto se estiver 'disponível' nos Objetivos ou se o Plano tatico atual pedir prepare_objective/trade_objective.",
  "- Se não tiver nada útil, responda SILENCIO.",
  "- Sempre mencione pelo menos um campeão por nome na dica.",
  "- Sempre referencie um objetivo, lane ou situação específica do estado do jogo.",
  "- NUNCA dê conselhos genéricos como 'foque em farmar', 'evite confrontos', 'jogue seguro'. Esses são inúteis.",
  "- Se receber posição do jogador, adapte a dica pra essa posição.",
  "- NUNCA invente posição dos campeões no mapa. Você NÃO sabe onde eles estão.",
  "- A dica é SEMPRE para o jogador (primeiro campeão nos Aliados). Nunca dê instrução para companheiros.",
  "- Se a situação é parecida com a anterior, mantenha a mesma direção. Não contradiga sem mudança clara."
];

const MATCHUP_PROMPT_INTRO = [
  "Você é um coach de League of Legends em PT-BR.",
  "O jogador acabou de entrar na partida. Dê uma dica sobre a matchup.",
  "A resposta será lida em voz alta por TTS."
];

const MATCHUP_PROMPT_FIXED_RULES = [
  "- Máximo 2 frases, até 25 palavras no total.",
  "- Primeira frase: dica principal da matchup (o que tomar cuidado ou como ganhar).",
  "- Segunda frase: quando lutar ou quando evitar luta.",
  "- Use apenas português. Sem termos em inglês.",
  "- Cada frase DEVE terminar com ponto final.",
  "- Sem markdown, emojis, listas ou abreviações.",
  "- Acentuação correta.",
  "- Identifique o adversário direto da lane do jogador e foque a dica nele.",
  "- Mencione o nome do adversário direto na dica."
];

const SERIO_PHRASES: PhraseSet = {
  mapa: [
    "Olha o minimapa.",
    "Dá uma olhada no mapa.",
    "Checa o minimapa.",
    "Não esquece de olhar o mapa.",
    "Olho no mapa.",
    "Confere a visão no mapa.",
    "Passa o olho no minimapa antes de avançar.",
    "Mapa. Olha lá."
  ],

  ouroParado: [
    "Você está com muito ouro parado. Pensa em voltar pra base.",
    "Muito ouro guardado. Volta pra base e gasta.",
    "Ouro acumulando. Hora de voltar pra base.",
    "Tá com ouro sobrando. Volta base e fecha item.",
    "Ouro parado demais. Reseta e fortalece."
  ],

  inimigoFed: [
    "{name} está muito forte. Cuidado com a força {pronoun}.",
    "{name} tá carregando o jogo. Evita lutar contra.",
    "{name} tá carregando. Não enfrenta sozinho.",
    "{name} tá dominando. Joga em grupo contra {name}.",
    "Cuidado, {name} tá forte. Foca outros alvos primeiro.",
    "Respeita {name} nas lutas. Espera o time pra engajar."
  ],

  inimigoBuild: [
    "{name} acelerou os itens. Respeita a força {pronoun}.",
    "{name} fechou item forte. Cuidado com a força {pronoun}.",
    "{name} tá com itens avançados. Evita confronto direto.",
    "{name} acelerou a build. Joga com o time contra {name}.",
    "{name} tá montando itens rápido. Cuidado no um contra um."
  ],

  powerspike: [
    "Você bateu powerspike de {count}. Aproveita pra forçar.",
    "Powerspike de {count} atingido. Hora de pressionar."
  ],

  torreGenerica: [
    "Caiu torre inimiga no {lane}, aproveita prioridade para rotacionar.",
    "Torre inimiga do {lane} caiu, abre o mapa e pressiona.",
    "Derrubaram torre no {lane}, usa a vantagem pra avançar."
  ],

  torreMid: [
    "Caiu torre inimiga do mid, abre mapa para rotação e visão profunda."
  ],

  torreTopDragao: [
    "Caiu torre inimiga no top, usa tempo para preparar o dragão."
  ],

  torreBotBarao: [
    "Caiu torre inimiga no bot, segura as tropas e se posiciona pro barão."
  ],

  torrePerdidaGenerica: [
    "Perdemos torre no {lane}. Cuidado com a pressão inimiga.",
    "Torre aliada do {lane} caiu. Joga mais recuado.",
    "Caiu nossa torre no {lane}. Não entra sozinho."
  ],

  torrePerdidaMid: [
    "Perdemos torre do mid. Toma cuidado com rotas inimigas."
  ],

  torrePerdidaTop: [
    "Perdemos torre do top. Cuidado com a pressão lateral."
  ],

  torrePerdidaBot: [
    "Perdemos torre do bot. Fica atento ao dragão."
  ],

  inimigoMorreu: [
    "{name} morreu, aproveita pra avançar.",
    "{name} caiu, pressiona o mapa.",
    "{name} morreu, usa o tempo pra ganhar espaço."
  ],

  morteJogador: [
    "Cuidado com {name}, evita ficar sozinho contra.",
    "Toma cuidado com {name}. Joga perto do time."
  ],

  morteStreak: [
    "Você morreu {count} vezes, joga mais seguro e perto do time.",
    "Muitas mortes. Reseta a cabeça e joga seguro."
  ],

  itemFechado: [
    "Você fechou {item}. Ficou mais forte.",
    "{item} concluído. Aproveita o powerspike."
  ],

  inimigoItemPerigoso: [
    "{name} fechou {item}. Cuidado, ficou mais forte.",
    "{name} completou {item}. Respeita a força.",
    "{name} tem {item} agora. Evita trocar sozinho.",
    "{name} fechou {item}. Joga mais cauteloso.",
    "{name} completou {item}. Não subestima o dano."
  ],

  inimigoAntiCura: [
    "Inimigo comprou anti-cura. Você vai curar menos."
  ],

  inimigoArmadura: [
    "Inimigo tá comprando armadura. Seu dano físico vai cair."
  ],

  inimigoResistMagica: [
    "Inimigo comprando resistência mágica. Seu dano mágico vai cair."
  ],

  ultDisponivel: [
    "Nível 6. Sua ult tá disponível, procura uma chance de forçar.",
    "Bateu nível 6, ult liberada. Hora de pressionar."
  ],

  inimigoUltAntes: [
    "{name} bateu nível 6 antes de você. Cuidado com a ult.",
    "{name} tem ult e você não. Joga recuado até upar."
  ],

  levelUpChave: [
    "Nível {level} atingido. Ficou mais forte agora."
  ],

  inicioPartida: [
    "Beleza, começou a partida. Bora jogar."
  ],

  inibidorInimigo: [
    "Pegamos inibidor. Mantém a pressão.",
    "Inibidor inimigo destruído. Aproveita os super minions."
  ],

  inibidorPerdido: [
    "Perdemos inibidor. Defende a base e espera oportunidade.",
    "Inibidor aliado caiu. Segura a onda e não força."
  ],

  vitoriaPartida: [
    "Vitória. Boa partida."
  ],

  derrotaPartida: [
    "Derrota. Faz parte, próxima a gente ganha."
  ],

  jungleGank: [
    "{lane} tá vulnerável. Bom momento pra gankar.",
    "Oportunidade no {lane}. Considera uma emboscada.",
    "{lane} aberto. Se tiver caminho, vai.",
    "Janela pra pressionar {lane}. Aproveita.",
    "Considera gankar {lane} agora."
  ],
  junglePressao: [
    "{lane} precisa de ajuda. Passa por lá.",
    "Tá perdendo pressão no {lane}. Dá um suporte.",
    "{lane} tá sofrendo. Alivia a pressão.",
    "Time precisa de presença no {lane}.",
    "Ajuda o {lane} antes de perder mais."
  ],
  jungleTimingDefensivo: [
    "Cuidado, caçador inimigo pode atacar {lane} a qualquer momento.",
    "Atenção no {lane}. Caçador inimigo pode aparecer.",
    "Respeita o {lane}. Janela de ataque do caçador.",
  ],
  jungleTimingOfensivo: [
    "Caçador inimigo está limpando a selva. Janela para atacar {lane}.",
    "Caçador inimigo ocupado. Aproveita para pressionar {lane}.",
    "Selva inimiga sendo limpa. Vai no {lane} agora.",
  ],
  jungleTimingSegundaRotacao: [
    "Segunda rotação do caçador. Cuidado no {lane}.",
    "Caçador inimigo pode voltar. Respeita o {lane}.",
  ],
  jungleTimingMorte: [
    "Caçador inimigo morreu. Quando voltar, provável ataque no {lane}.",
    "Caçador inimigo caiu. Fique atento no {lane} quando ele voltar.",
  ],
  jungleTimingMorteOfensivo: [
    "Caçador inimigo morreu. Aproveita para atacar {lane}.",
    "Caçador inimigo caiu. Vai pressionar {lane} agora.",
  ],
  aceInimigo: [
    "Ace! Força um objetivo agora.",
    "Ace! Barão, torre ou dragão, escolhe e vai.",
    "Ace! Todos mortos, pressiona o mapa agora."
  ],
  aceAliado: [
    "Nosso time caiu. Joga seguro e espera o respawn.",
    "Ace no nosso time. Defende o que puder até voltarem."
  ],
  dragonSoulProximo: [
    "Falta {count} dragão pra alma do dragão. Prioriza o próximo.",
    "Só falta {count} dragão pra alma. Não perde o próximo."
  ],
  dragonSoulInimigoProximo: [
    "Inimigo a {count} dragão da alma. Prioridade máxima no dragão.",
    "Inimigo quase pegando a alma do dragão. Briga pelo dragão a todo custo."
  ],
  multikillInimigo: [
    "{name} fez {type}. Respeita e não enfrenta sozinho.",
    "{name} pegou {type}. Cuidado, tá em sequência."
  ],
  multikillAliado: [
    "{name} fez {type}. Aproveita o momentum.",
    "{name} pegou {type}. Força com o time agora."
  ],
  objetivoRoubado: [
    "{name} foi roubado! Azar, foca no próximo.",
    "Perdemos o {name} por roubo. Segue o jogo."
  ],
  objetivoRoubadoPorNos: [
    "Roubamos o {name}! Que jogada.",
    "{name} roubado. Aproveita a vantagem."
  ],
  inibidorVoltou: [
    "Inibidor inimigo voltou. Perdemos a pressão de super minions.",
    "Inibidor respawnou. Precisa empurrar de novo."
  ],
  csAlerta: [
    "Você matou poucos minions. Foca em farmar entre as lutas.",
    "Farm tá fraco. Pega as tropas quando não tiver luta."
  ],
  dragonTipo: [
    "Dragão de {type} pro time. {hint}",
  ],
  dragonTipoInimigo: [
    "Inimigo pegou dragão de {type}. {hint}",
    "Dragão de {type} pro inimigo. Fica atento à contagem.",
  ],
  summonerSpellAlerta: [
    "{name} tem {spell}. {hint}",
  ],
  wardAlerta: [
    "Tá wardando pouco. Coloca wards pra ter visão.",
    "Pouca visão no mapa. Lembra de usar as wards."
  ],
  firstBlood: [
    "Primeiro sangue! Bom começo, mantém a pressão.",
    "Primeiro abate! Aproveita a vantagem."
  ],
  firstBloodInimigo: [
    "Inimigo pegou o primeiro abate. Joga mais cauteloso.",
    "Primeiro sangue pro inimigo. Cuidado no início."
  ],
  laneVantagemOuro: [
    "{opponent} tá com {gold} de ouro a mais que você. Cuidado no confronto direto.",
    "Teu oponente {opponent} tá na frente em ouro. Evita trocar sem vantagem."
  ],
  laneDesvantagemOuro: [
    "Você tá com vantagem de ouro contra {opponent}. Aproveita pra pressionar.",
    "Você tá na frente contra {opponent}. Força troca quando puder."
  ]
};

const MEME_PHRASES: PhraseSet = {
  mapa: [
    "Mapa não é enfeite, dá uma olhada aí.",
    "Confere o minimapa antes de virar clipe de erro.",
    "Olha o mapa, pelo amor do LP.",
    "O minimapa tá ali pedindo atenção. Dá um olho.",
    "Mapa existe. Usa antes de virar meme.",
    "Olha o minimapa antes que alguém olhe pra você.",
    "Confere o mapa. Informação gratuita ali.",
    "Minimapa. Olha. Agradece depois."
  ],

  ouroParado: [
    "Esse ouro parado tá fazendo cosplay de decoração. Volta base e gasta.",
    "Tá juntando ouro pra abrir banco. Reseta e compra item.",
    "O bolso tá cheio e o inventário triste. Base agora.",
    "Tá fazendo poupança? Volta base e investe nos itens.",
    "Ouro parado é ouro inútil. Reseta e gasta."
  ],

  inimigoFed: [
    "{name} virou chefão. Não vira conteúdo pra ele não.",
    "{name} tá gigante. Se respeita e não peita sozinho.",
    "{name} tá solando geral. Não vira conteúdo de graça.",
    "{name} tá imprimindo ouro. Não vai na onda sozinho.",
    "Respeita {name}. Esse aí tá jogando outro jogo.",
    "{name} virou problema do time inteiro. Não tenta resolver sozinho."
  ],

  inimigoBuild: [
    "{name} turboou os itens. Respeita a força {pronoun}.",
    "{name} montou build de patrão. Vai na manha e respeita.",
    "{name} tá de itens de respeito. Não facilita.",
    "{name} acelerou os itens. Esse aí tá perigoso.",
    "{name} montou o kit completo. Evita confronto solo."
  ],

  powerspike: [
    "Powerspike de {count} na conta. Hora de cobrar aluguel do mapa.",
    "Você ficou forte com {count}. Agora pisa sem dormir no ponto."
  ],

  torreGenerica: [
    "Caiu torre inimiga no {lane}. Abre o mapa e faz bagunça organizada.",
    "Torre do {lane} caiu. Agora gira antes que o jogo lembre de te punir."
  ],

  torreMid: [
    "Caiu a torre do mid. O mapa abriu igual porta de shopping."
  ],

  torreBotBarao: [
    "Caiu torre inimiga no bot. Segura as tropas e chama o barão pro rolê."
  ],

  torrePerdidaGenerica: [
    "Perdemos torre no {lane}. Sem heroísmo de TikTok agora.",
    "Nossa torre do {lane} caiu. Joga recuado e para de inventar."
  ],

  torrePerdidaMid: [
    "Perdemos a torre do mid. Agora qualquer passeio inimigo vira problema."
  ],

  torrePerdidaTop: [
    "Perdemos torre do top. Respeita a lateral antes de virar meme."
  ],

  torrePerdidaBot: [
    "Perdemos torre do bot. Fica esperto com o dragão, gênio."
  ],

  inimigoMorreu: [
    "{name} morreu. Hora de fazer compras no mapa.",
    "{name} saiu de cena. Aproveita o espaço.",
    "{name} caiu. Bora avançar antes que volte."
  ],

  morteJogador: [
    "Cuidado com {name}. Não vira episódio repetido contra {name}.",
    "Respeita {name} e joga colado no time."
  ],

  morteStreak: [
    "Você morreu {count} vezes. Fecha a torneira e joga seguro.",
    "Já deu de morrer. Respira e cola no time."
  ],

  itemFechado: [
    "Você fechou {item}. Agora dá pra falar mais grosso.",
    "{item} pronto. Tá liberado bater com confiança."
  ],

  inimigoItemPerigoso: [
    "{name} fechou {item}. Não testa a ciência agora.",
    "{name} completou {item}. Respeita antes de virar piada.",
    "{name} fechou {item}. Agora a coisa ficou séria de verdade.",
    "{name} com {item} é outro campeão. Se liga.",
    "{name} completou {item}. Respeita antes de trocar."
  ],

  inimigoAntiCura: [
    "Compraram anti-cura. Sua cura foi de base sem avisar."
  ],

  inimigoArmadura: [
    "Inimigo tá de armadura. Seu dano físico vai bater fofo."
  ],

  inimigoResistMagica: [
    "Inimigo fechando resistência mágica. Sua magia vai bater de pantufa."
  ],

  ultDisponivel: [
    "Nível 6. A ult chegou, então para de economizar botão."
  ],

  inimigoUltAntes: [
    "{name} pegou ult antes. Joga pianinho até empatar.",
    "{name} tá com ult e você não. Sem gracinha agora."
  ],

  levelUpChave: [
    "Nível {level} na conta. Agora você tem licença pra pressionar."
  ],

  inicioPartida: [
    "Partida começou. Bora fingir que a solo queue faz sentido."
  ],

  inibidorInimigo: [
    "Pegamos inibidor. Agora mantém a pressão e não faz fanfic.",
    "Inibidor inimigo caiu. Usa os super minions sem dormir no ponto."
  ],

  inibidorPerdido: [
    "Perdemos inibidor. Defende a base e para de forçar milagre.",
    "Inibidor aliado caiu. Segura a onda e joga com cérebro."
  ],

  vitoriaPartida: [
    "Vitória. Hoje o caos trabalhou a seu favor."
  ],

  derrotaPartida: [
    "Derrota. Solo queue sendo solo queue."
  ],

  jungleGank: [
    "{lane} tá pedindo visita. Faz uma visita.",
    "Oportunidade no {lane}. Vai antes que alguém roube.",
    "{lane} aberto feito porta de mercado. Aproveita.",
    "Tem emboscada fácil no {lane}. Não ignora.",
    "{lane} vulnerável. Hora de aparecer."
  ],
  junglePressao: [
    "{lane} tá apanhando. Vai lá ajudar.",
    "Seus aliados no {lane} tão sofrendo. Passa lá.",
    "{lane} precisa de ajuda. Para de farmar e vai.",
    "Time precisa de você no {lane}. Bora.",
    "{lane} tá caindo. Alivia antes de virar meme."
  ],
  jungleTimingDefensivo: [
    "O caçador tá vindo. Ward o {lane} e reza.",
    "Alerta de caçador no {lane}. Hora de fingir que sabe jogar seguro.",
  ],
  jungleTimingOfensivo: [
    "Caçador inimigo limpando selva. Vai no {lane} antes que ele acorde.",
    "Inimigo tá matando bicho. Aproveita e vai pro {lane}.",
  ],
  jungleTimingSegundaRotacao: [
    "Segunda volta do caçador. {lane} vai sofrer de novo.",
    "Caçador voltando. {lane} é o alvo provável.",
  ],
  jungleTimingMorte: [
    "Caçador morreu. Quando voltar, vai querer vingança no {lane}.",
  ],
  jungleTimingMorteOfensivo: [
    "Caçador morreu. Hora de fazer a festa no {lane}.",
  ],
  aceInimigo: [
    "Ace! Hora de fazer compras no mapa deles.",
    "Ace! Aproveita antes que alguém respawne."
  ],
  aceAliado: [
    "Nosso time virou cinzas. Hora de fingir que tá fazendo algo útil.",
    "Ace no nosso time. Segura a onda e reza."
  ],
  dragonSoulProximo: [
    "Falta {count} dragão pra alma. Não é hora de farmar golems.",
    "Só falta {count} dragão pra alma. Se liga no dragão."
  ],
  dragonSoulInimigoProximo: [
    "Inimigo quase pegando a alma do dragão. Se perder esse, bom jogo.",
    "Inimigo a {count} dragão da alma. Hora de brigar ou chorar."
  ],
  multikillInimigo: [
    "{name} fez {type}. Tá colecionando abate.",
    "{name} pegou {type}. Não vira a próxima vítima."
  ],
  multikillAliado: [
    "{name} fez {type}. Esse aí tá voando.",
    "{name} tá destruindo com {type}. Cola nele."
  ],
  objetivoRoubado: [
    "{name} foi roubado. Smite de mentira.",
    "Perdemos o {name} no roubo. Acontece nas melhores famílias."
  ],
  objetivoRoubadoPorNos: [
    "Roubamos o {name}! Que crime perfeito.",
    "{name} roubado. Loot grátis."
  ],
  inibidorVoltou: [
    "Inibidor voltou. Os super minions aposentaram cedo.",
    "Inibidor respawnou. A pressão acabou, bora empurrar de novo."
  ],
  csAlerta: [
    "Os minions não morrem sozinhos. Mata as tropas.",
    "Farm tá fraco. Pega uns minions entre as aventuras."
  ],
  dragonTipo: [
    "Dragão de {type} pro time. {hint}",
  ],
  dragonTipoInimigo: [
    "Inimigo pegou dragão de {type}. Não deixa acumular.",
    "Dragão de {type} pro inimigo. Se liga na contagem.",
  ],
  summonerSpellAlerta: [
    "{name} tem {spell}. {hint}",
  ],
  wardAlerta: [
    "Wardando igual jogador de ARAM. Coloca ward.",
    "Visão tá cega. Usa as wards antes de virar meme."
  ],
  firstBlood: [
    "Primeiro sangue! Bom começo, não entrega agora.",
    "Primeiro abate! Agora segura a onda."
  ],
  firstBloodInimigo: [
    "Inimigo pegou o primeiro abate. Relaxa, tem jogo ainda.",
    "Primeiro sangue pro inimigo. Segue o baile."
  ],
  laneVantagemOuro: [
    "{opponent} tá mais rico que você. Não peita o cara com essa carteira.",
    "Teu oponente {opponent} tá com vantagem. Farmeia antes de brigar."
  ],
  laneDesvantagemOuro: [
    "Você tá mais rico que {opponent}. Hora de cobrar aluguel.",
    "Vantagem de ouro contra {opponent}. Mete pressão."
  ]
};

const PUTO_PHRASES: PhraseSet = {
  mapa: [
    "Olha a porra do minimapa.",
    "Mapa existe, caralho. Usa.",
    "Confere o minimapa agora.",
    "Olha o mapa, porra. Não é difícil.",
    "Mapa ali embaixo. Usa essa merda.",
    "Confere o minimapa antes de fazer besteira.",
    "Olha o mapa agora. Sem desculpa.",
    "Minimapa, caralho. Um olho lá, outro aqui."
  ],

  ouroParado: [
    "Tá com ouro parado pra caralho. Volta base e compra item.",
    "Para de passear com esse ouro no bolso. Reseta agora.",
    "Esse ouro parado não bate sozinho. Base e gasta.",
    "Volta base e gasta esse ouro. Tá jogando de cofre.",
    "Para de juntar ouro e compra item, porra."
  ],

  inimigoFed: [
    "{name} tá forte pra caralho. Não peita sozinho.",
    "{name} tá gigante. Respeita a força {pronoun}.",
    "{name} virou problema. Para de dar luta de graça.",
    "{name} tá comendo geral. Para de alimentar.",
    "Respeita {name} e joga com o time, porra.",
    "{name} tá forte demais. Não peita essa merda sozinho."
  ],

  inimigoBuild: [
    "{name} acelerou os itens. Respeita essa porra.",
    "{name} fechou item forte. Não testa a força {pronoun}.",
    "{name} tá montando tudo. Não vai sozinho nessa merda.",
    "{name} acelerou os itens. Joga com o time agora.",
    "{name} tá de itens fortes. Respeita ou morre."
  ],

  powerspike: [
    "Powerspike de {count}. Agora pisa, porra.",
    "Você ficou forte com {count}. Vai pra frente direito."
  ],

  torreGenerica: [
    "Caiu torre inimiga no {lane}. Roda logo e pressiona essa merda.",
    "Torre do {lane} caiu. Usa a vantagem sem enrolar."
  ],

  torreMid: [
    "Caiu a torre do mid. Abre o mapa e invade essa porra."
  ],

  torreTopDragao: [
    "Caiu torre inimiga no top. Aproveita e prepara o dragão direito."
  ],

  torrePerdidaGenerica: [
    "Perdemos torre no {lane}. Para de andar sozinho.",
    "Nossa torre do {lane} caiu. Recuar não é pecado."
  ],

  torrePerdidaMid: [
    "Perdemos a torre do mid. Agora qualquer rotação inimiga fode o mapa."
  ],

  torrePerdidaTop: [
    "Perdemos torre do top. Segura a lateral e para de vacilar."
  ],

  torrePerdidaBot: [
    "Perdemos torre do bot. Se liga no dragão e fecha a cara."
  ],

  inimigoMorreu: [
    "{name} morreu. Vai pra cima agora, porra.",
    "{name} caiu. Pressiona essa merda.",
    "{name} morreu. Aproveita e avança logo."
  ],

  morteJogador: [
    "Cuidado com {name}. Para de dar mole pra {name}.",
    "Respeita {name} e joga com o time."
  ],

  morteStreak: [
    "Você morreu {count} vezes. Chega dessa merda e joga seguro.",
    "Morreu demais. Para de se entregar e cola no time."
  ],

  itemFechado: [
    "Você fechou {item}. Agora usa essa porra.",
    "{item} pronto. Bora bater direito."
  ],

  inimigoItemPerigoso: [
    "{name} fechou {item}. Respeita essa merda.",
    "{name} completou {item}. Não entra torto agora.",
    "{name} fechou {item}. Agora fodeu se trocar sozinho.",
    "{name} com {item} é problema. Respeita a força.",
    "{name} completou {item}. Evita confronto direto."
  ],

  inimigoAntiCura: [
    "Compraram anti-cura. Você vai curar porra nenhuma."
  ],

  inimigoArmadura: [
    "Inimigo tá empilhando armadura. Seu dano físico vai murchar."
  ],

  inimigoResistMagica: [
    "Inimigo tá de resistência mágica. Sua magia vai bater fofo."
  ],

  ultDisponivel: [
    "Nível 6. Sua ult tá pronta, então usa direito."
  ],

  inimigoUltAntes: [
    "{name} pegou ult antes. Segura essa porra até upar.",
    "{name} tá com ult e você não. Recuar agora é obrigatório."
  ],

  levelUpChave: [
    "Nível {level}. Você ficou forte, então joga como gente."
  ],

  inicioPartida: [
    "Partida começou. Bora parar de fazer merda cedo."
  ],

  inibidorInimigo: [
    "Pegamos inibidor. Mantém a pressão e fecha essa porra.",
    "Inibidor inimigo caiu. Usa os super minions direito."
  ],

  inibidorPerdido: [
    "Perdemos inibidor. Defende a base e para de forçar merda.",
    "Inibidor aliado caiu. Segura a onda sem se afobar."
  ],

  vitoriaPartida: [
    "Vitória. Finalmente fez o básico."
  ],

  derrotaPartida: [
    "Derrota. Jogo horroroso, segue."
  ],

  jungleGank: [
    "{lane} tá de graça. Vai gankar logo.",
    "Oportunidade no {lane}, porra. Vai.",
    "{lane} aberto. Para de farmar e ganka.",
    "Tem emboscada fácil no {lane}. Não perde isso.",
    "{lane} vulnerável. Aparece lá agora."
  ],
  junglePressao: [
    "{lane} tá apanhando. Vai ajudar, caralho.",
    "{lane} precisa de você agora. Para de enrolar.",
    "Seus aliados no {lane} tão morrendo. Faz alguma coisa.",
    "{lane} tá sofrendo. Alivia essa merda.",
    "Vai pro {lane} antes de perder tudo."
  ],
  jungleTimingDefensivo: [
    "Caçador inimigo vem aí. Se morrer no {lane} a culpa é sua.",
    "Atenção no {lane}. Caçador pode aparecer e te destruir.",
  ],
  jungleTimingOfensivo: [
    "Caçador inimigo limpando selva. Vai pro {lane} e faz algo útil.",
    "Inimigo tá na selva. Para de farmar e ataca {lane}.",
  ],
  jungleTimingSegundaRotacao: [
    "Segunda rotação. Se não wardou {lane}, merece morrer.",
  ],
  jungleTimingMorte: [
    "Caçador morreu. Quando voltar vai querer sangue no {lane}.",
  ],
  jungleTimingMorteOfensivo: [
    "Caçador morreu. Vai pro {lane} antes dele voltar.",
  ],
  aceInimigo: [
    "Ace! Vai pro objetivo agora, porra.",
    "Ace! Se não pegar nada agora, desinstala."
  ],
  aceAliado: [
    "Nosso time morreu inteiro. Segura a porra da base.",
    "Ace no nosso time. Não força nada e espera."
  ],
  dragonSoulProximo: [
    "Falta {count} dragão pra alma. Para de ignorar o dragão.",
    "Só falta {count} dragão pra alma. Prioriza essa merda."
  ],
  dragonSoulInimigoProximo: [
    "Inimigo quase pegando a alma do dragão. Se perder esse, fodeu.",
    "Inimigo a {count} da alma. Briga pelo dragão ou perde o jogo."
  ],
  multikillInimigo: [
    "{name} fez {type}. Para de alimentar essa merda.",
    "{name} pegou {type}. Respeita e joga com o time."
  ],
  multikillAliado: [
    "{name} fez {type}. Cola nesse maluco e força.",
    "{name} tá comendo geral com {type}. Aproveita."
  ],
  objetivoRoubado: [
    "{name} foi roubado. Que smite horrível.",
    "Perdemos o {name} no roubo. Que vergonha."
  ],
  objetivoRoubadoPorNos: [
    "Roubamos o {name}! Belo roubo, porra.",
    "{name} roubado. Agora usa essa vantagem direito."
  ],
  inibidorVoltou: [
    "Inibidor voltou. Perdemos a pressão, vai empurrar de novo.",
    "Inibidor respawnou, porra. Para de enrolar e empurra."
  ],
  csAlerta: [
    "Farm tá uma merda. Mata os minions, porra.",
    "Tá farmando mal demais. Pega as tropas entre as lutas."
  ],
  dragonTipo: [
    "Dragão de {type} pro time. {hint}",
  ],
  dragonTipoInimigo: [
    "Inimigo pegou dragão de {type}. Para de ignorar o dragão.",
    "Dragão de {type} pro inimigo. Acorda pra contagem, porra.",
  ],
  summonerSpellAlerta: [
    "{name} tem {spell}. {hint}",
  ],
  wardAlerta: [
    "Wardando nada. Coloca ward, caralho.",
    "Visão zero. Usa as wards antes de morrer de bobeira."
  ],
  firstBlood: [
    "Primeiro sangue! Bom começo, agora não estraga.",
    "Primeiro abate! Usa essa vantagem direito, porra."
  ],
  firstBloodInimigo: [
    "Inimigo pegou o primeiro abate. Não surta, joga seguro.",
    "Primeiro sangue pro inimigo. Para de forçar e joga."
  ],
  laneVantagemOuro: [
    "{opponent} tá com mais ouro que você. Para de perder minion, porra.",
    "Teu oponente {opponent} tá na frente. Joga seguro até empatar."
  ],
  laneDesvantagemOuro: [
    "Você tá com vantagem contra {opponent}. Agora usa essa merda direito.",
    "Tá na frente contra {opponent}. Mete pressão e não desperdiça."
  ]
};

export const MESSAGE_MODE_PROFILES: Record<MessageMode, MessageModeProfile> = {
  serio: {
    label: "Sério",
    systemStyle: [
      "- Tom sério, direto e profissional.",
      "- Priorize clareza, utilidade e objetividade."
    ],
    matchupStyle: [
      "- Tom sério, direto e profissional.",
      "- Explique a matchup com clareza e sem floreio."
    ],
    phrases: SERIO_PHRASES
  },
  meme: {
    label: "Meme",
    systemStyle: [
      "- Tom brincalhão, debochado e levemente caótico.",
      "- Faça humor curto, mas a dica ainda precisa ser útil na jogada.",
      "- Não transforme a resposta em piada pura nem em bordão longo."
    ],
    matchupStyle: [
      "- Tom brincalhão e provocativo.",
      "- A dica deve soar divertida, mas continuar prática e acionável."
    ],
    phrases: MEME_PHRASES
  },
  puto: {
    label: "Puto",
    systemStyle: [
      "- Tom puto, agressivo e impaciente, sempre focado na jogada.",
      "- Pode usar palavrão leve ou médio no máximo uma vez.",
      "- Nunca use slur, ataque identitário, ameaça ou ofensa gratuita sem instrução útil."
    ],
    matchupStyle: [
      "- Tom puto e ríspido, com cobrança direta.",
      "- Pode usar palavrão leve ou médio no máximo uma vez.",
      "- Continue útil, claro e focado na matchup."
    ],
    phrases: PUTO_PHRASES
  }
};

export function normalizeMessageMode(mode: string): MessageMode {
  return mode in MESSAGE_MODE_PROFILES ? (mode as MessageMode) : "serio";
}

export function getActiveMessageMode(): MessageMode {
  return normalizeMessageMode(settings.coachMessageMode);
}

export function getMessageModeProfile(mode = settings.coachMessageMode): MessageModeProfile {
  return MESSAGE_MODE_PROFILES[normalizeMessageMode(mode)];
}

export function getPhraseSet(key: string, mode = settings.coachMessageMode): string[] {
  const normalized = normalizeMessageMode(mode);
  return MESSAGE_MODE_PROFILES[normalized].phrases[key] ?? SERIO_PHRASES[key] ?? [];
}

export function pickModePhrase(key: string, mode = settings.coachMessageMode): string {
  const variants = getPhraseSet(key, mode);
  if (variants.length === 0) return "";
  return variants[Math.floor(Math.random() * variants.length)];
}

export function buildSystemPrompt(mode = settings.coachMessageMode): string {
  const profile = getMessageModeProfile(mode);
  return [
    ...SYSTEM_PROMPT_INTRO,
    "Regras de estilo:",
    ...profile.systemStyle,
    "Regras fixas:",
    ...SYSTEM_PROMPT_FIXED_RULES
  ].join("\n");
}

export function buildMatchupPrompt(mode = settings.coachMessageMode): string {
  const profile = getMessageModeProfile(mode);
  return [
    ...MATCHUP_PROMPT_INTRO,
    "Regras de estilo:",
    ...profile.matchupStyle,
    "Regras fixas:",
    ...MATCHUP_PROMPT_FIXED_RULES
  ].join("\n");
}

export const PHRASES = SERIO_PHRASES;

export const ITEM_TAGS: Record<string, string[]> = {
  antiCura: [
    "Lembrete Mortal",
    "Morellonomicon",
    "Armadura de Espinhos",
    "Serrespada Quimiopunk"
  ],
  armadura: [
    "Coração Congelado",
    "Presságio de Randuin",
    "Armadura de Espinhos",
    "Couraça do Defunto",
    "Manopla dos Glacinatas",
    "Placa Gargolítica",
    "Jak'Sho",
    "Égide de Fogo Solar",
    "Dança da Morte"
  ],
  resistMagica: [
    "Força da Natureza",
    "Semblante Espiritual",
    "Máscara Abissal",
    "Limite da Razão",
    "Mandíbula de Malmortius",
    "Rookern Lamúrico",
    "Véu da Banshee"
  ]
};

export const CATEGORY_COOLDOWNS: Record<string, number> = {
  mapa: 50,
  ouroParado: 120,
  inimigoFed: 120,
  inimigoBuild: 120,
  powerspike: 60,
  torre: 30,
  torrePerdida: 30,
  inimigoMorreu: 15,
  morteJogador: 90,
  morteStreak: 180,
  objetivo: 15,
  itemFechado: 30,
  inimigoItem: 60,
  levelUp: 30,
  inibidor: 60,
  fimDeJogo: 0,
  jungleGank: 60,
  junglePressao: 90,
  jungleTiming: 45,
  generico: 30,
  ace: 0,
  dragonSoul: 120,
  multikill: 30,
  objetivoRoubo: 0,
  inibidorRespawn: 60,
  csAlerta: 300,
  dragonTipo: 120,
  dragonTipoInimigo: 120,
  summonerSpell: 300,
  wardAlerta: 300,
  firstBlood: 0,
  laneOuro: 120,
};

export const FEMALE_CHAMPIONS = new Set([
  "Ahri", "Akali", "Anivia", "Annie", "Ashe", "Aurora", "Bel'Veth",
  "Briar", "Caitlyn", "Camille", "Cassiopeia", "Diana", "Elise",
  "Evelynn", "Fiora", "Gwen", "Illaoi", "Irelia", "Janna", "Jinx",
  "Kai'Sa", "Kalista", "Karma", "Katarina", "Kayle", "Kindred",
  "LeBlanc", "Leona", "Lillia", "Lissandra", "Lulu", "Lux",
  "Miss Fortune", "Morgana", "Nami", "Neeko", "Nidalee", "Nilah",
  "Orianna", "Poppy", "Qiyana", "Quinn", "Rell", "Renata Glasc",
  "Riven", "Samira", "Sejuani", "Senna", "Seraphine", "Shyvana",
  "Sivir", "Sona", "Soraka", "Syndra", "Taliyah", "Tristana",
  "Vayne", "Vi", "Xayah", "Yuumi", "Zeri", "Zoe", "Zyra"
]);

export const SYSTEM_PROMPT = buildSystemPrompt("serio");
export const MATCHUP_PROMPT = buildMatchupPrompt("serio");

export const CATEGORY_PRIORITIES: Record<string, number> = {
  objetivo: 3,
  fimDeJogo: 3,
  torre: 2,
  torrePerdida: 2,
  morteStreak: 2,
  inibidor: 2,
  powerspike: 1,
  itemFechado: 1,
  inimigoFed: 1,
  inimigoItem: 1,
  inimigoBuild: 1,
  levelUp: 1,
  inimigoMorreu: 1,
  morteJogador: 1,
  jungleGank: 1,
  junglePressao: 1,
  jungleTiming: 2,
  mapa: 0,
  ouroParado: 0,
  generico: 0,
  ace: 3,
  dragonSoul: 3,
  multikill: 2,
  objetivoRoubo: 3,
  inibidorRespawn: 1,
  csAlerta: 0,
  dragonTipo: 1,
  dragonTipoInimigo: 2,
  summonerSpell: 0,
  wardAlerta: 0,
  firstBlood: 1,
  laneOuro: 0,
};

export const COOLDOWN_GROUPS: Record<string, string> = {
  inimigoFed: "inimigoPerigo",
  inimigoItem: "inimigoPerigo",
  inimigoBuild: "inimigoPerigo",
};

export const GROUP_COOLDOWN_SECONDS = 180;
