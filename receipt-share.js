window.shareReceiptPdf = async function(saleId, receiptNumber){
  try {
    const sale = db.sales.find(x => x.id === saleId);
    if (!sale) {
      alert('Venda não encontrada.');
      return;
    }

    const JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) {
      alert('Não foi possível carregar o gerador de PDF. Verifique sua internet e tente novamente.');
      return;
    }

    const customer = findCustomer(sale.customer) || { name: sale.customer };
    const product = findProduct(sale.product) || {};
    const status = Number(sale.receivable || 0) <= 0 ? 'PAGAMENTO QUITADO' : 'PAGAMENTO PARCIAL';

    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    const left = 18;
    const maxWidth = 174;
    let y = 20;

    function writeLine(label, value) {
      const safe = String(value == null ? '' : value);
      doc.setFont('helvetica', 'bold');
      doc.text(label, left, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(safe, 120);
      doc.text(lines, 66, y);
      y += Math.max(7, lines.length * 5.2);
    }

    doc.setTextColor(31, 107, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(companyName(), left, y);
    y += 9;

    doc.setFontSize(14);
    doc.text('RECIBO Nº ' + receiptNumber, left, y);
    y += 8;

    doc.setDrawColor(31, 107, 42);
    doc.line(left, y, left + maxWidth, y);
    y += 9;

    doc.setTextColor(24, 32, 24);
    doc.setFontSize(10);

    writeLine('Data:', sale.date);
    writeLine('Cliente:', customer.name || sale.customer);
    if (customer.cpf_cnpj) writeLine('CPF/CNPJ:', customer.cpf_cnpj);
    if (customer.phone) writeLine('Telefone:', customer.phone);
    if (customerAddress(customer)) writeLine('Endereço:', customerAddress(customer));

    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Dados da compra', left, y);
    y += 8;
    doc.setFontSize(10);

    writeLine('Produto:', sale.product);
    writeLine('Descrição:', product.details || sale.product);
    writeLine('Quantidade:', sale.quantity);
    writeLine('Preço unitário:', money(sale.unit_price || 0));
    writeLine('Frete cobrado:', money(sale.freight_charged || 0));
    writeLine('Total da venda:', money(sale.total || 0));
    if (sale.invoice_number) writeLine('NF:', sale.invoice_number);

    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Confirmação de pagamento', left, y);
    y += 8;
    doc.setFontSize(10);

    writeLine('Valor recebido:', money(sale.received || 0));
    writeLine('Saldo:', money(sale.receivable || 0));
    writeLine('Situação:', status);

    if (db.settings.receipt_text) {
      y += 2;
      doc.setFont('helvetica', 'normal');
      const text = doc.splitTextToSize(String(db.settings.receipt_text), maxWidth);
      doc.text(text, left, y);
      y += text.length * 5.2 + 4;
    }

    if (db.settings.document_footer) {
      doc.setFontSize(8);
      doc.setTextColor(90, 100, 90);
      const footer = doc.splitTextToSize(String(db.settings.document_footer), maxWidth);
      doc.text(footer, left, Math.min(y + 6, 278));
    }

    const blob = doc.output('blob');
    const fileName = 'Recibo-' + receiptNumber + '-Silagem-Baixa-Verde.pdf';
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Recibo nº ' + receiptNumber + ' - ' + companyName()
      });
      return;
    }

    doc.save(fileName);
    alert('Este aparelho não permite compartilhar PDF direto pelo navegador. O arquivo foi baixado para envio manual.');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('Erro ao compartilhar recibo em PDF', err);
    alert('Não foi possível compartilhar o recibo em PDF neste aparelho.');
  }
};
