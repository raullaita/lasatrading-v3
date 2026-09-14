import { test, expect } from '@playwright/test';

test.describe('Flujo en vivo: Monitor de Señales a Journal (Pasos 3.1 - 3.8)', () => {
  
  test('debe completar el flujo de señal, alerta, telegram y journal correctamente', async ({ page }) => {
    // 3.1 & 3.2: Navegar al monitor y esperar que el feed de señales se nutra (simulamos que ya hay una señal del task_manager)
    await page.goto('/monitor');
    await expect(page.locator('text=Running')).toBeVisible(); // Job card status
    
    // Esperamos a que aparezca al menos una señal en el feed (poll de 60s simulado o dato existente)
    const signalRow = page.locator('tr').filter({ hasText: 'BTCUSDT' }).first(); // Ajusta 'BTCUSDT' a un símbolo real de tu test
    await expect(signalRow).toBeVisible({ timeout: 10000 });

    // Extraemos datos de la señal para verificar el pre-llenado
    const symbol = await signalRow.locator('.symbol-cell').innerText();
    const direction = await signalRow.locator('.direction-cell').innerText();

    // 3.3: Click en "📓 Registrar en Journal"
    const journalButton = signalRow.locator('button:has-text("📓 Registrar en Journal")');
    await expect(journalButton).toBeVisible();
    await journalButton.click();

    // 3.4: Verificar navegación y pre-llenado del TradeModal
    await expect(page).toHaveURL(/\/journal\?new_trade=true&symbol=.+/);
    
    // Verificar que el modal está abierto
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    
    // Verificar que trade_type está en "paper" por defecto
    const tradeTypeSelect = page.locator('select[name="trade_type"]'); // Ajusta el selector a tu HTML real
    await expect(tradeTypeSelect).toHaveValue('paper');

    // Verificar pre-llenado de campos (ajusta los selectores a tus inputs reales)
    await expect(page.locator('input[name="symbol"]')).toHaveValue(symbol);
    await expect(page.locator('select[name="direction"]')).toHaveValue(direction.toLowerCase()); // o como lo manejes

    // Guardamos el trade (simulado)
    await page.locator('button:has-text("Guardar Trade")').click();
    await expect(page.locator('text=Trade registrado correctamente')).toBeVisible(); // Asumiendo que tienes un toast de éxito

    // Volvemos al monitor para probar alertas y telegram
    await page.goto('/monitor');

    // 3.5: Crear Alerta
    await page.locator('button:has-text("Crear Alerta")').click();
    // ... (rellenar formulario de alerta si es necesario) ...
    await page.locator('button:has-text("Confirmar Alerta")').click();
    await expect(page.locator('text=Alerta de precio creada correctamente')).toBeVisible();

    // 3.6: Eliminar Alerta con ConfirmDialog
    await page.locator('button:has-text("Eliminar")').first().click(); // Asumiendo que abre el ConfirmDialog
    await page.locator('button:has-text("Confirmar")').click(); // Botón del ConfirmDialog
    await expect(page.locator('text=Alerta eliminada')).toBeVisible();

    // 3.7: Probar Telegram (Simulando el fallo 'sent:false' del backend)
    const telegramBtn = page.locator('button:has-text("Probar Telegram")');
    await telegramBtn.click();
    
    // Verificar spinner (asumiendo que añades una clase 'animate-spin' o similar al icono)
    // await expect(page.locator('.spinner-icon')).toBeVisible(); 
    
    // Verificar toast de error (ya que el backend devuelve sent:false)
    await expect(page.locator('text=Error: Telegram no configurado o fallo en el envío')).toBeVisible({ timeout: 5000 });

    // 3.8: Verificar que el trade abierto NO está en /performance pero SÍ en /journal
    await page.goto('/performance');
    // Verificar que la tabla de performance está vacía o no contiene el trade abierto
    await expect(page.locator('text=No hay trades cerrados')).toBeVisible(); // O la lógica que uses para estado vacío

    await page.goto('/journal');
    // Verificar que el trade "paper" que creamos sí aparece en el journal
    await expect(page.locator(`text=${symbol}`)).toBeVisible();
    await expect(page.locator('text=paper')).toBeVisible();
  });
});