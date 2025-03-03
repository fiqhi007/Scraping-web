
        let selectedImages = new Set();
        let allImages = [];

        document.getElementById('scrapeBtn').addEventListener('click', scrapeImages);
        document.getElementById('selectAllBtn').addEventListener('click', toggleSelectAll);
        document.getElementById('downloadBtn').addEventListener('click', downloadImages);

        async function scrapeImages() {
            const url = document.getElementById('urlInput').value.trim();
            if (!url) return alert('Masukkan URL terlebih dahulu!');

            showLoading();
            try {
                const response = await axios.get(`/scrape?url=${encodeURIComponent(url)}`);
                allImages = response.data.images;
                renderImages(allImages);
                updateUI();
            } catch (error) {
                alert('Gagal mengambil gambar: ' + error.message);
            }
            hideLoading();
        }

        function toggleSelectAll() {
            const allSelected = selectedImages.size === allImages.length;
            
            if (allSelected) {
                selectedImages.clear();
            } else {
                allImages.forEach(img => selectedImages.add(img));
            }
            
            updateCheckboxes();
            updateUI();
        }

        function updateCheckboxes() {
            document.querySelectorAll('.image-checkbox').forEach(checkbox => {
                checkbox.checked = selectedImages.has(checkbox.dataset.url);
            });
        }

        function updateUI() {
            const count = selectedImages.size;
            document.getElementById('count').textContent = count;
            document.getElementById('selectionCount').textContent = 
                `${count} gambar terpilih`;
            document.getElementById('downloadBtn').disabled = count === 0;
            document.getElementById('selectAllBtn').textContent = 
                count === allImages.length ? 'Batal Pilih Semua' : 'Pilih Semua';
        }

        function renderImages(images) {
            const grid = document.getElementById('imageGrid');
            grid.innerHTML = '';
            
            images.forEach((imgUrl) => {
                const card = document.createElement('div');
                card.className = 'image-card';
                card.innerHTML = `
                    <input 
                        type="checkbox" 
                        class="image-checkbox" 
                        data-url="${imgUrl}"
                        onchange="toggleImage('${imgUrl}')"
                        ${selectedImages.has(imgUrl) ? 'checked' : ''}
                    >
                    <img 
                        src="${imgUrl}" 
                        class="image-preview" 
                        loading="lazy"
                        onerror="this.style.display='none'"
                        onclick="openModal('${imgUrl}')"
                    >
                `;
                grid.appendChild(card);
            });
        }

        function toggleImage(url) {
            selectedImages.has(url) ? 
                selectedImages.delete(url) : 
                selectedImages.add(url);
            updateUI();
        }

        async function downloadImages() {
            if (selectedImages.size === 0) return;
            
            showLoading();
            try {
                const response = await axios.post('/download', {
                    images: Array.from(selectedImages)
                }, { 
                    responseType: 'blob',
                    validateStatus: (status) => status >= 200 && status < 500
                });

                if (response.status === 400) {
                    try {
                        const errorText = await response.data.text();
                        const errorData = JSON.parse(errorText);
                        const errorMessage = [
                            errorData.error,
                            ...(errorData.details || []).slice(0, 3)
                        ].join('\n');
                        alert(`Gagal mengunduh:\n${errorMessage}`);
                        return;
                    } catch {
                        alert('Terjadi kesalahan tidak diketahui saat mengunduh');
                    }
                }

                const blob = new Blob([response.data], { type: 'application/zip' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `images_${Date.now()}.zip`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                
            } catch (error) {
                alert('Gagal mengunduh: ' + (error.response?.data?.error || error.message));
            } finally {
                hideLoading();
            }
        }

        function openModal(url) {
            document.getElementById('modalImage').src = url;
            document.getElementById('imageModal').style.display = 'flex';
        }

        function closeModal() {
            document.getElementById('imageModal').style.display = 'none';
        }

        function showLoading() {
            document.getElementById('loading').style.display = 'flex';
        }

        function hideLoading() {
            document.getElementById('loading').style.display = 'none';
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
