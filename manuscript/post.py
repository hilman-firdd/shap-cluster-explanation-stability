import re, sys, zipfile, shutil
f=sys.argv[1]; tmp=f+'.tmp'
zin=zipfile.ZipFile(f); zout=zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    data=zin.read(it.filename)
    if it.filename=='word/document.xml':
        data=re.sub(rb'<w:highlightCs [^>]*/>',b'',data)
    zout.writestr(it,data)
zout.close(); zin.close(); shutil.move(tmp,f)
