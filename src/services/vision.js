const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Menganalisis foto nota / struk belanja menggunakan AI Vision (GPT-4o-mini / Gemini)
 */
async function analyzeReceiptPhoto(imageUrlOrBase64, isBase64 = false) {
  const prompt = `Anda adalah asisten AI akuntansi profesional. 
Tugas Anda adalah membaca dan menganalisis foto nota, struk belanja, struk ATM, atau bukti transfer ini.

Ekstrak informasi penting dan kembalikan HANYA format JSON valid tanpa tanda markdown (tanpa \`\`\`json):
{
  "merchant": "Nama Toko / Merchant / Penjual (misal: Indomaret, SPBU Pertamina, Tokopedia, Warung Makan, dsb)",
  "total": 50000,
  "category": "Makanan & Minuman / Transportasi / Belanja Kebutuhan / Tagihan & Listrik / Kesehatan / Hiburan / Lain-lain",
  "items": ["Item 1", "Item 2"],
  "notes": "Rincian singkat belanjaan",
  "date": "Tanggal nota jika terbaca (DD/MM/YYYY) atau kosongkan"
}

Peraturan:
1. "total" HARUS berupa angka integer murni tanpa titik atau koma (contoh: 48500).
2. Jika ada diskon atau pajak, ambil TOTAL AKHIR yang harus dibayar.
3. Tentukan "category" yang paling relevan.`;

  // Metode A: OpenAI GPT-4o-mini Vision
  if (OPENAI_API_KEY && !OPENAI_API_KEY.startsWith('YOUR_')) {
    try {
      const imagePayload = isBase64
        ? { url: `data:image/jpeg;base64,${imageUrlOrBase64}` }
        : { url: imageUrlOrBase64 };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: imagePayload }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.2
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0]?.message?.content) {
        const rawContent = data.choices[0].message.content.trim().replace(/^```json/i, '').replace(/```$/g, '').trim();
        const parsed = JSON.parse(rawContent);
        return {
          success: true,
          merchant: parsed.merchant || 'Struk Belanja',
          total: Number(parsed.total) || 0,
          category: parsed.category || 'Belanja Kebutuhan',
          items: Array.isArray(parsed.items) ? parsed.items : [],
          notes: parsed.notes || (parsed.items ? parsed.items.join(', ') : 'Belanja'),
          date: parsed.date || ''
        };
      }
    } catch (err) {
      console.warn('⚠️ [OpenAI Vision Error]:', err.message);
    }
  }

  // Fallback default jika AI gagal parsing
  return {
    success: false,
    merchant: 'Nota Belanja',
    total: 0,
    category: 'Belanja Kebutuhan',
    items: [],
    notes: 'Foto struk belanja'
  };
}

module.exports = {
  analyzeReceiptPhoto
};
