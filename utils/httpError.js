// Bir transaction/iş mantığı fonksiyonu, HTTP handler'a hangi status kodu +
// mesajla cevap vermesi gerektiğini söylemek için bunu fırlatır. Böylece
// aynı doğrulama/hesaplama mantığı (ör. sipariş oluşturma) birden fazla
// çağıran (doğrudan HTTP isteği, ya da personel onayı gibi başka bir akış)
// tarafından, res.status().json() çağrısına dokunmadan yeniden kullanılabilir.
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

module.exports = { HttpError };
