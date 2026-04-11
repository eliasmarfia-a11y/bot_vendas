const { MercadoPagoConfig, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

async function createPixPayment(amount, description, email) {
  const body = {
    transaction_amount: amount,
    description: description,
    payment_method_id: 'pix',
    payer: {
      email: email,
    },
  };

  try {
    const response = await payment.create({ body });
    return {
      id: response.id,
      qr_code: response.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
      status: response.status,
    };
  } catch (error) {
    console.error('Erro ao criar pagamento Pix:', error);
    throw error;
  }
}

module.exports = { createPixPayment };
