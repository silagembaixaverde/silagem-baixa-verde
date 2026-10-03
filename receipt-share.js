async function receiptLogoPng(){
  return new Promise(function(resolve,reject){
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      try{
        const canvas=document.createElement('canvas');
        canvas.width=512;
        canvas.height=512;
        const ctx=canvas.getContext('2d');
        ctx.clearRect(0,0,512,512);
        ctx.drawImage(img,0,0,512,512);
        resolve(canvas.toDataURL('image/png'));
      }catch(err){reject(err)}
    };
    img.onerror=reject;
    img.src=appLogo();
  });
}

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

    let headerLeft = left;
    try {
      const logoPng = await receiptLogoPng();
      doc.addImage(logoPng, 'PNG', left, 14, 28, 28);
      headerLeft = left + 34;
      y = 20;
    } catch (logoErr) {
      console.warn('Logo não pôde ser adicionada ao PDF', logoErr);
    }

    doc.setTextColor(31, 107, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(companyName(), headerLeft, y);
    y += 8;

    doc.setTextColor(70, 82, 72);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const companyLines = [];
    if (db.settings.cpf_cnpj) companyLines.push('CPF/CNPJ: ' + db.settings.cpf_cnpj);
    if (db.settings.phone) companyLines.push('Telefone: ' + db.settings.phone);
    if (db.settings.email) companyLines.push('E-mail: ' + db.settings.email);
    const companyAddress = [db.settings.address, db.settings.city, db.settings.state]
      .filter(Boolean)
      .join(', ');
    if (companyAddress) companyLines.push('Endereço: ' + companyAddress);

    companyLines.forEach(function(lineText) {
      const lines = doc.splitTextToSize(String(lineText), maxWidth);
      doc.text(lines, headerLeft, y);
      y += Math.max(5, lines.length * 4.5);
    });

    y += 2;
    doc.setTextColor(31, 107, 42);
    doc.setFont('helvetica', 'bold');
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

    const safeCustomer = String(customer.name || sale.customer || 'Cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const safeDate = String(sale.date || '').trim() || new Date().toISOString().slice(0,10);
    const fileName = safeDate + ' - ' + safeCustomer + '.pdf';

    const capPlugins = window.Capacitor && window.Capacitor.Plugins;
    const nativeFs = capPlugins && capPlugins.Filesystem;
    const nativeShare = capPlugins && capPlugins.Share;
    if (nativeFs && nativeShare) {
      const dataUri = doc.output('datauristring');
      const base64 = dataUri.split(',')[1];
      const saved = await nativeFs.writeFile({
        path: fileName,
        data: base64,
        directory: 'CACHE'
      });
      await nativeShare.share({
        title: fileName,
        url: saved.uri,
        dialogTitle: 'Enviar recibo'
      });
      return;
    }

    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: fileName
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


window.shareQuotePdf = async function(quoteId){
  try{
    const quote=db.quotes.find(q=>q.id===quoteId);
    if(!quote){
      alert('Orçamento não encontrado.');
      return;
    }

    const JsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!JsPDF){
      alert('Não foi possível carregar o gerador de PDF. Verifique sua internet e tente novamente.');
      return;
    }

    const customer=quote.customer||{name:'Cliente'};
    const doc=new JsPDF({unit:'mm',format:'a4'});
    const left=18;
    const maxWidth=174;
    let y=20;

    function ensureSpace(h=10){
      if(y+h>278){
        doc.addPage();
        y=20;
      }
    }

    function writeLine(label,value){
      ensureSpace(10);
      const safe=String(value==null?'':value);
      doc.setFont('helvetica','bold');
      doc.text(label,left,y);
      doc.setFont('helvetica','normal');
      const lines=doc.splitTextToSize(safe,120);
      doc.text(lines,66,y);
      y+=Math.max(7,lines.length*5.2);
    }

    let headerLeft=left;
    try{
      const logoPng=await receiptLogoPng();
      doc.addImage(logoPng,'PNG',left,14,28,28);
      headerLeft=left+34;
    }catch(err){
      console.warn('Logo não pôde ser adicionada ao orçamento',err);
    }

    doc.setTextColor(31,107,42);
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.text(companyName(),headerLeft,y);
    y+=8;

    doc.setTextColor(70,82,72);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    const companyLines=[];
    if(db.settings.cpf_cnpj)companyLines.push('CPF/CNPJ: '+db.settings.cpf_cnpj);
    if(db.settings.phone)companyLines.push('Telefone: '+db.settings.phone);
    if(db.settings.email)companyLines.push('E-mail: '+db.settings.email);
    const companyAddress=[db.settings.address,db.settings.city,db.settings.state].filter(Boolean).join(', ');
    if(companyAddress)companyLines.push('Endereço: '+companyAddress);
    companyLines.forEach(function(lineText){
      const lines=doc.splitTextToSize(String(lineText),maxWidth);
      doc.text(lines,headerLeft,y);
      y+=Math.max(5,lines.length*4.5);
    });

    y+=3;
    doc.setTextColor(31,107,42);
    doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.text('ORÇAMENTO Nº '+quote.number,left,y);
    y+=8;

    doc.setDrawColor(31,107,42);
    doc.line(left,y,left+maxWidth,y);
    y+=9;

    doc.setTextColor(24,32,24);
    doc.setFontSize(10);
    writeLine('Data:',quote.date);
    writeLine('Cliente:',customer.name||'');
    if(customer.cpf_cnpj)writeLine('CPF/CNPJ:',customer.cpf_cnpj);
    if(customer.phone)writeLine('Telefone:',customer.phone);
    if(customerAddress(customer))writeLine('Endereço:',customerAddress(customer));
    writeLine('Validade:',String(quote.valid_days||'')+' dias');
    writeLine('Pagamento:',quote.payment_method||'');

    y+=2;
    ensureSpace(12);
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.text('Produtos',left,y);
    y+=7;
    doc.setFontSize(9);

    (quote.items||[]).forEach(function(item,index){
      ensureSpace(18);
      doc.setFont('helvetica','bold');
      doc.text((index+1)+'. '+String(item.product||''),left,y);
      y+=5;
      doc.setFont('helvetica','normal');
      if(item.description){
        const desc=doc.splitTextToSize(String(item.description),maxWidth);
        doc.text(desc,left,y);
        y+=desc.length*4.5;
      }
      doc.text('Qtd.: '+String(item.quantity||0)+'   Unitário: '+money(item.unit_price||0)+'   Total: '+money(Number(item.quantity||0)*Number(item.unit_price||0)),left,y);
      y+=7;
    });

    ensureSpace(26);
    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    writeLine('Subtotal:',money(quote.subtotal||0));
    writeLine('Frete:',money(quote.freight||0));
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(31,107,42);
    doc.text('TOTAL: '+money(quote.total||0),left,y);
    y+=9;

    if(quote.notes){
      doc.setTextColor(24,32,24);
      doc.setFont('helvetica','normal');
      doc.setFontSize(10);
      const notes=doc.splitTextToSize('Observações: '+String(quote.notes),maxWidth);
      ensureSpace(notes.length*5+5);
      doc.text(notes,left,y);
      y+=notes.length*5+4;
    }

    if(db.settings.document_footer){
      doc.setTextColor(90,100,90);
      doc.setFontSize(8);
      const footer=doc.splitTextToSize(String(db.settings.document_footer),maxWidth);
      ensureSpace(footer.length*4.5+4);
      doc.text(footer,left,y);
    }

    const safeCustomer=String(customer.name||'Cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[\\/:*?"<>|]/g,'-')
      .replace(/\s+/g,' ')
      .trim();
    const safeDate=String(quote.date||'').trim()||new Date().toISOString().slice(0,10);
    const fileName=safeDate+' - '+safeCustomer+' - Orcamento '+String(quote.number||'')+'.pdf';

    const capPlugins=window.Capacitor&&window.Capacitor.Plugins;
    const nativeFs=capPlugins&&capPlugins.Filesystem;
    const nativeShare=capPlugins&&capPlugins.Share;
    if(nativeFs&&nativeShare){
      const dataUri=doc.output('datauristring');
      const base64=dataUri.split(',')[1];
      const saved=await nativeFs.writeFile({
        path:fileName,
        data:base64,
        directory:'CACHE'
      });
      await nativeShare.share({
        title:fileName,
        url:saved.uri,
        dialogTitle:'Enviar orçamento'
      });
      return;
    }

    const blob=doc.output('blob');
    const file=new File([blob],fileName,{type:'application/pdf'});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:fileName});
      return;
    }

    doc.save(fileName);
    alert('Este aparelho não permite compartilhar PDF direto pelo navegador. O arquivo foi baixado para envio manual.');
  }catch(err){
    if(err&&err.name==='AbortError')return;
    console.error('Erro ao compartilhar orçamento em PDF',err);
    alert('Não foi possível compartilhar o orçamento em PDF neste aparelho.');
  }
};
