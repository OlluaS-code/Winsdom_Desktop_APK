const Grade = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
};

class FSRSEngine {
  constructor(requestRetention = 0.9) {
    this.requestRetention = requestRetention;
    this.decay = -0.5;
    this.factor = 19.0 / 81.0; // Constante para R=0.9 em t=S
    
    // Pesos padrão calibrados do FSRS v4.5
    this.w = [
      0.40255, 1.18385, 3.173, 15.69105, 
      7.1434, 0.6477, 1.0007, 0.0674, 
      1.6597, 0.1712, 0.9997, 2.0205, 
      0.0923, 0.3085, 0.4005, 0.7238, 1.4798
    ];
  }

  calculateRetrievability(card, nowTimestamp) {
    if (!card.lastReview || card.state === 'NEW') return 0;
    const elapsedDays = Math.max(0, (nowTimestamp - card.lastReview) / 86400000);
    return Math.pow(1 + (this.factor * elapsedDays) / card.stability, this.decay);
  }

  calculateNextInterval(stability) {
    const rawInterval = (stability / this.factor) * (Math.pow(this.requestRetention, 1 / this.decay) - 1);
    return Math.max(1, Math.round(rawInterval));
  }

  processReview(card, grade, nowTimestamp = Date.now()) {
    const isNew = card.state === 'NEW' || !card.lastReview;
    const currentR = this.calculateRetrievability(card, nowTimestamp);
    
    let newS = 0;
    let newD = 0;

    if (isNew) {
      newS = this.w[grade - 1];
      newD = Math.min(10, Math.max(1, this.w[4] - Math.exp(this.w[5] * (grade - 1)) + 1));
    } else {
      // Atualização da Dificuldade (D)
      const deltaD = -this.w[6] * (grade - 3);
      const dPrime = this.w[7] * (this.w[4] - Math.exp(this.w[5] * 2) + 1) + (1 - this.w[7]) * (card.difficulty + deltaD);
      newD = Math.min(10, Math.max(1, dPrime));

      // Atualização da Estabilidade (S)
      if (grade === Grade.AGAIN) {
        newS = this.w[11] * 
               Math.pow(card.difficulty, -this.w[12]) * 
               (Math.pow(card.stability + 1, this.w[13]) - 1) * 
               Math.exp(this.w[14] * (1 - currentR));
        newS = Math.min(card.stability, Math.max(0.1, newS));
      } else {
        const gradeMultiplier = grade === Grade.HARD ? this.w[15] : grade === Grade.EASY ? this.w[16] : 1.0;
        newS = card.stability * (1 + Math.exp(this.w[8]) * 
               (11 - newD) * 
               Math.pow(card.stability, -this.w[9]) * 
               (Math.exp(this.w[10] * (1 - currentR)) - 1) * 
               gradeMultiplier);
      }
    }

    const scheduledDays = grade === Grade.AGAIN ? 0 : this.calculateNextInterval(newS);
    const nextDueDate = scheduledDays === 0 
      ? nowTimestamp + 600000 // 10 minutos para reestudo imediato
      : nowTimestamp + scheduledDays * 86400000;

    return {
      ...card,
      state: grade === Grade.AGAIN ? 'LEARNING' : 'REVIEW',
      stability: parseFloat(newS.toFixed(4)),
      difficulty: parseFloat(newD.toFixed(4)),
      reps: (card.reps || 0) + 1,
      lapses: grade === Grade.AGAIN ? (card.lapses || 0) + 1 : (card.lapses || 0),
      lastReview: nowTimestamp,
      due: nextDueDate
    };
  }
}

window.Grade = Grade;
window.FSRSEngine = FSRSEngine;
