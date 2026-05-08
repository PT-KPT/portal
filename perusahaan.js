const CompanyPage = {
  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
      </div>
    <div class="row g-3"><div class="col-lg-12"><div class="card">
      <div class="card-header"><i class="bi bi-pencil-square"></i> Informasi Perusahaan</div>
      <div class="card-body">
        <form id="companyForm" onsubmit="return false;">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label">Nama Perusahaan <span class="text-danger">*</span></label>
              <input type="text" class="form-control" id="inputCompanyName" required placeholder="PT. Contoh Kontraktor">
            </div>
            <div class="col-12">
              <label class="form-label">Alamat Lengkap</label>
              <textarea class="form-control" id="inputAddress" rows="2" placeholder="Jl. Contoh No. 123, Kota, Provinsi"></textarea>
            </div>
            <div class="col-sm-4">
              <label class="form-label">Telepon / Kontak</label>
              <input type="text" class="form-control" id="inputContact" placeholder="+62 812-3456-7890">
            </div>
            <div class="col-sm-4">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" id="inputEmail" placeholder="info@perusahaan.com">
            </div>
            <div class="col-sm-4">
              <label class="form-label">Website</label>
              <input type="text" class="form-control" id="inputWebsite" placeholder="www.perusahaan.com">
            </div>
          </div>
          <div class="d-flex justify-content-end gap-2 mt-4">
            <button type="button" class="btn btn--outline-secondary" onclick="CompanyPage.loadCompanyData()">
              <i class="bi bi-arrow-counterclockwise"></i> Reset
            </button>
            <button type="button" class="btn btn--primary" onclick="CompanyPage.saveCompanyData()">
              <i class="bi bi-save"></i> Simpan
            </button>
          </div>
        </form>
      </div>
    </div></div></div>`;
  },

  async init() { await this.loadCompanyData(); },

  async loadCompanyData() {
    const company = await DataAccess.getCompany();
    if (company) {
      document.getElementById('inputCompanyName').value = company.name || '';
      document.getElementById('inputAddress').value = company.address || '';
      document.getElementById('inputContact').value = company.contact || '';
      document.getElementById('inputEmail').value = company.email || '';
      document.getElementById('inputWebsite').value = company.website || '';
    }
  },

  async saveCompanyData() {
    const name = document.getElementById('inputCompanyName').value.trim();
    if (!name) { UIService.showToast('Nama perusahaan wajib diisi!', 'warning'); return; }

    const data = {
      id: 'comp_main',
      name,
      address: document.getElementById('inputAddress').value.trim(),
      contact: document.getElementById('inputContact').value.trim(),
      email: document.getElementById('inputEmail').value.trim(),
      website: document.getElementById('inputWebsite').value.trim()
    };

    await DataAccess.saveCompany(data);
    UIService.invalidateGuardCache();
    UIService.showToast('Profil berhasil disimpan!', 'success');

    const hasP = await DataAccess.hasProjects();
    if (!hasP) {
      setTimeout(() => {
        UtilityService.showConfirmDialog(
          'Data perusahaan berhasil disimpan!\n\nSelanjutnya, buat Proyek pertama Anda.\n\nMau buat proyek sekarang?',
          () => UIService.navigate('proyek')
        );
      }, 400);
    }
  }
};
// Di akhir perusahaan.js, tambahkan:
export { CompanyPage };