import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Test, TestSection, QuestionFormat } from '../store';

const getOptions = (f: QuestionFormat) => 
  f === 'SA' ? [] : f.startsWith('A-D') ? ['A', 'B', 'C', 'D'] : f.startsWith('A-E') ? ['A', 'B', 'C', 'D', 'E'] : ['T', 'F'];

export const generatePDF = async (test: Partial<Test>, onComplete?: () => void, onError?: (err: any) => void) => {
  try {
    const pdfDoc = await PDFDocument.create();
    const form = pdfDoc.getForm();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const sections = test.sections || [];
    const numQuestions = sections.reduce((acc, s) => acc + (parseInt(s.count as any) || 0), 0);
    const questionFormats = sections.flatMap(sec => Array.from({ length: parseInt(sec.count as any) || 0 }).fill(sec.format) as QuestionFormat[]);
    
    const maxQuestionsPerPage = 80;
    const numPages = Math.max(1, Math.ceil(numQuestions / maxQuestionsPerPage));
    
    for (let p = 0; p < numPages; p++) {
      const page = pdfDoc.addPage([612, 792]);
      const width = page.getWidth();
      const height = page.getHeight();
      const marginX = 40;
      
      let currentY = height - 40;

      // Banner — mark-sense green, the sheet's house colour
      const brandColor = rgb(0.078, 0.376, 0.29); // #14604A
      page.drawRectangle({
         x: marginX, y: currentY - 40, 
         width: width - marginX * 2, height: 40,
         color: brandColor
      });
      
      const bannerText = (test.name || 'Untitled Assessment').toUpperCase();
      page.drawText(bannerText, { x: marginX + 15, y: currentY - 25, size: 16, font: helveticaBold, color: rgb(1,1,1) });
      
      // Page Indicator
      page.drawText(`Page ${p + 1} of ${numPages}`, {
        x: width - marginX - 80, y: currentY - 23, size: 10, font: helveticaBold, color: rgb(1,1,1)
      });

      currentY -= 55;
      
      const detailsTopY = currentY;
      
      // Details Box
      if (test.courseName || test.instructorName) {
         let detailText = '';
         if (test.courseName) detailText += `COURSE: ${test.courseName.toUpperCase()}\n`;
         if (test.instructorName) detailText += `INSTRUCTOR: ${test.instructorName.toUpperCase()}`;
         page.drawText(detailText, { x: marginX, y: detailsTopY, size: 10, font: helveticaBold, color: rgb(0.2,0.2,0.2), lineHeight: 14 });
         
         currentY -= (detailText.split('\n').length * 14) + 10;
      }

      // Student ID block — real fillable fields so digitally-completed
      // PDFs carry the student's name and id back into the app.
      if (test.includeStudentId !== false && p === 0) {
         const idBoxX = width - marginX - 220;
         const idBoxY = detailsTopY - 50;
         page.drawRectangle({ x: idBoxX, y: idBoxY, width: 220, height: 50, borderColor: brandColor, borderWidth: 1.5 });

         page.drawText('STUDENT NAME:', { x: idBoxX + 10, y: idBoxY + 32, size: 7, font: helveticaBold, color: brandColor });
         try {
           const nameField = form.createTextField('student_name');
           nameField.addToPage(page, {
             x: idBoxX + 80, y: idBoxY + 26, width: 130, height: 12,
             borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5,
           });
           nameField.setFontSize(9);
         } catch(e) {}

         page.drawText('ID:', { x: idBoxX + 10, y: idBoxY + 12, size: 7, font: helveticaBold, color: brandColor });
         try {
           const idField = form.createTextField('student_id');
           idField.addToPage(page, {
             x: idBoxX + 40, y: idBoxY + 6, width: 170, height: 12,
             borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5,
           });
           idField.setFontSize(9);
         } catch(e) {}

         if (idBoxY - 15 < currentY) {
             currentY = idBoxY - 15;
         }
      }

      page.drawText(`INSTRUCTIONS: Use a No. 2 pencil. Fill circles completely.`, { 
        x: marginX, y: currentY, size: 10, font: helveticaBold, color: brandColor 
      });
      currentY -= 15;

      // Separator Line
      page.drawLine({ start: { x: marginX, y: currentY }, end: { x: width - marginX, y: currentY }, thickness: 2, color: brandColor });
      currentY -= 20;
      
      // Form grid
      const startQ = p * maxQuestionsPerPage + 1;
      const endQ = Math.min((p + 1) * maxQuestionsPerPage, numQuestions);
      
      const columnCount = 4;
      const rowsPerColumn = Math.ceil(maxQuestionsPerPage / columnCount);
      const colWidth = (width - marginX * 2) / columnCount;
      
      if (numQuestions > 0) {
        // Draw column dividers
        for (let c = 1; c < columnCount; c++) {
            page.drawLine({ 
                start: { x: marginX + c * colWidth, y: currentY + 10 }, 
                end: { x: marginX + c * colWidth, y: 50 }, 
                thickness: 1, color: rgb(0.9, 0.9, 0.9) 
             });
        }

        for (let c = 0; c < columnCount; c++) {
          const colX = marginX + c * colWidth;
          const colStart = startQ + c * rowsPerColumn;
          const colEnd = Math.min(startQ + (c + 1) * rowsPerColumn - 1, endQ);
          if (colStart > endQ) break;
          
          for (let i = colStart; i <= colEnd; i++) {
             const indexInCol = i - colStart;
             const groupedOffset = Math.floor(indexInCol / 5) * 10;
             const rowY = currentY - indexInCol * 20 - groupedOffset;
             
             const textWidth = helveticaBold.widthOfTextAtSize(`${i}.`, 10);
             page.drawText(`${i}.`, { x: colX + 18 - textWidth, y: rowY - 10, size: 10, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
             
             try {
                 const qFormat = questionFormats[i - 1] || 'A-D';
                 const isMultiple = qFormat.endsWith('-M');
                 const ops = getOptions(qFormat);
                 
                 let radioGroup;
                 if (qFormat === 'SA') {
                   const textField = form.createTextField(`q.${i}`);
                   textField.addToPage(page, {
                      x: colX + 32, y: rowY - 14, width: colWidth - 50, height: 16,
                      borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1
                   });
                   
                   page.drawText("Short Answer", {
                      x: colX + 34, y: rowY - 22, size: 6, font: helvetica, color: rgb(0.5, 0.5, 0.5)
                   });
                   continue;
                 } else if (!isMultiple) {
                   radioGroup = form.createRadioGroup(`q.${i}`);
                 }

                 for (let j = 0; j < ops.length; j++) {
                    const opt = ops[j];
                    const bubbleSize = 14;
                    const optX = colX + 32 + j * 18;
                    
                    const optTextWidth = helveticaBold.widthOfTextAtSize(opt, 7);
                    // Draw letter inside the bubble
                    page.drawText(opt, { x: optX + bubbleSize/2 - optTextWidth/2, y: rowY - 10, size: 7, font: helveticaBold, color: rgb(0.6,0.6,0.6) });

                    if (isMultiple) {
                      const checkBox = form.createCheckBox(`q.${i}.${opt}`);
                      checkBox.addToPage(page, {
                        x: optX, y: rowY - 13.5, width: bubbleSize, height: bubbleSize, 
                        borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1,
                      });
                    } else if (radioGroup) {
                      radioGroup.addOptionToPage(opt, page, {
                         x: optX, y: rowY - 13.5, width: bubbleSize, height: bubbleSize, 
                         borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1,
                      });
                    }
                 }
             } catch(err) {
                 console.error('Error creating form field', err);
             }
          }
        }
      }
      
      // Footer
      page.drawText('FORM A', { x: marginX, y: 30, size: 8, font: helveticaBold, color: rgb(0.4,0.4,0.4) });
      const rightText = 'GRADESTACK';
      const rightWidth = helveticaBold.widthOfTextAtSize(rightText, 8);
      page.drawText(rightText, { x: width - marginX - rightWidth, y: 30, size: 8, font: helveticaBold, color: rgb(0.4,0.4,0.4) });
    }

    pdfDoc.setTitle(test.name || 'Assessment');
    pdfDoc.setAuthor(test.instructorName || 'GradeStack');
    pdfDoc.setSubject(test.courseName || 'Test Template');
    pdfDoc.setProducer('GradeStack');
    pdfDoc.setKeywords([JSON.stringify({ 
      sections, 
      includeStudentId: test.includeStudentId 
    })]);

    const pdfBytes = await pdfDoc.save();

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${test.name || 'Assessment'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (onComplete) onComplete();
  } catch(err) {
    console.error(err);
    if (onError) onError(err);
    else alert("Failed to generate PDF. Please try again.");
  }
};
