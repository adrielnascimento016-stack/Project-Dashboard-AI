/**
 * Este é o script seed.js solicitado.
 * 
 * NOTA IMPORTANTE: Em um ambiente de navegador (como o AI Studio), scripts Node.js puros
 * que acessam o Firestore precisam do 'firebase-admin' e de uma Service Account Key.
 * 
 * Para facilitar a sua vida, eu JÁ IMPLEMENTEI essa mesma lógica diretamente no botão
 * "Gerar Dados Teste (2025)" dentro do Dashboard do aplicativo. 
 * 
 * Basta fazer login como Admin, ir para o Dashboard e clicar no botão. Ele usará sua
 * sessão autenticada para gerar os registros de forma segura e imediata.
 * 
 * Se você ainda quiser rodar isso localmente em sua máquina no futuro, você precisará:
 * 1. npm install firebase-admin
 * 2. Baixar sua chave de serviço do Firebase (serviceAccountKey.json)
 * 3. Executar: node seed.js
 */

const admin = require('firebase-admin');

// Descomente e adicione o caminho para sua chave de serviço se for rodar localmente
// const serviceAccount = require('./serviceAccountKey.json');

/*
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
*/

const db = admin.firestore();

async function seedDatabase() {
  console.log('Iniciando o seed do banco de dados...');
  
  const batch = db.batch();
  const modelos = ['Street', 'Trail', 'Sport'];
  const unidades = ['Matriz', 'Filial Sul', 'Filial Norte'];
  const vendedores = [
    { id: 'v1', nome: 'Adriel Nascimento' },
    { id: 'v2', nome: 'Carlos Silva' },
    { id: 'v3', nome: 'Ana Souza' },
    { id: 'v4', nome: 'Marcos Santos' },
    { id: 'v5', nome: 'Julia Costa' }
  ];

  // 1. Gerar 200 Vendas em 2025
  for (let i = 0; i < 200; i++) {
    const modelo = modelos[Math.floor(Math.random() * modelos.length)];
    const vendedor = vendedores[Math.floor(Math.random() * vendedores.length)];
    const unidade = unidades[Math.floor(Math.random() * unidades.length)];
    
    let basePrice = 15000;
    if (modelo === 'Trail') basePrice = 25000;
    if (modelo === 'Sport') basePrice = 50000;
    
    const valor = basePrice + Math.floor(Math.random() * 10000);
    const custo = Math.floor(valor * (Math.random() * 0.15 + 0.7)); // CMV: 70-85% do valor
    const margem = valor - custo;
    
    // Data aleatória em 2025
    const start = new Date(2025, 0, 1).getTime();
    const end = new Date(2025, 11, 31).getTime();
    const randomDate = new Date(start + Math.random() * (end - start));

    const newDocRef = db.collection('vendas').doc();
    batch.set(newDocRef, {
      data: randomDate.toISOString(),
      vendedor_id: vendedor.id,
      vendedor_nome: vendedor.nome,
      unidade: unidade,
      modelo_moto: modelo,
      valor_venda: valor,
      custo_direto: custo,
      margem_bruta: margem
    });
  }

  // 2. Gerar Metas para 2025 (12 meses x 3 unidades = 36 registros)
  for (let mes = 1; mes <= 12; mes++) {
    for (const unidade of unidades) {
      // Valores base para as metas (variando um pouco por unidade e mês)
      const baseVolume = unidade === 'Matriz' ? 40 : 25;
      const volumeMeta = baseVolume + Math.floor(Math.random() * 10); // 25 a 50 motos
      const ticketMedioMeta = 30000 + Math.floor(Math.random() * 5000); // ~30k a 35k
      const receitaMeta = volumeMeta * ticketMedioMeta;
      const margemBrutaMeta = Math.floor(receitaMeta * 0.22); // Meta de 22% de margem

      const metaRef = db.collection('metas').doc(`2025_${mes}_${unidade.replace(/\s+/g, '')}`);
      batch.set(metaRef, {
        ano: 2025,
        mes: mes,
        unidade: unidade,
        meta_volume: volumeMeta,
        meta_ticket_medio: ticketMedioMeta,
        meta_receita: receitaMeta,
        meta_margem_bruta: margemBrutaMeta
      });
    }
  }

  try {
    await batch.commit();
    console.log('Sucesso! 200 vendas e 36 registros de metas para 2025 foram criados.');
  } catch (error) {
    console.error('Erro ao fazer o seed:', error);
  }
}

// seedDatabase();
