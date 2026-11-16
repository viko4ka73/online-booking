export function emailDeliveryMessage(email?: { queued?: boolean; deliveryConfigured?: boolean }) {
  if (!email?.queued) return "";
  return email.deliveryConfigured
    ? "Письмо с подробностями будет отправлено на почту из вашего профиля."
    : "Отправка писем пока не подключена. Уведомление сохранено, данные записи доступны в личном кабинете.";
}
