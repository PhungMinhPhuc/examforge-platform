# Chặng nhị phân của đường MathType: oleObject*.bin -> MathML.
#
# Gọi từ Python, xem mathtype.py. Phải là Ruby vì phần đọc định dạng MTEF nằm
# trong gem `mathtype`, chưa có bản Python.
#
# Chuẩn bị:
#   gem install mathtype nokogiri
#   git clone https://github.com/jure/mathtype_to_mathml
#   set MATHTYPE_GEM_PATH=<...>/mathtype_to_mathml/lib
#
# Dùng:
#   ruby mathtype_to_mathml.rb <thư-mục-chứa-bin> <đầu-ra.json>

gem_path = ENV["MATHTYPE_GEM_PATH"].to_s
abort "chua dat MATHTYPE_GEM_PATH" if gem_path.empty?
$LOAD_PATH.unshift File.expand_path(gem_path)

require "mathtype_to_mathml"
require "json"

src, dest = ARGV[0], ARGV[1]
abort "thieu tham so: <thu-muc> <dau-ra.json>" if src.nil? || dest.nil?

ok, fail = {}, {}
Dir[File.join(src, "*.bin")].sort.each do |f|
  key = File.basename(f, ".bin")
  begin
    ok[key] = MathTypeToMathML::Converter.new(f).convert
  rescue => e
    fail[key] = "#{e.class}: #{e.message[0, 120]}"
  end
end

File.write(dest, JSON.generate({ "ok" => ok, "fail" => fail }))
warn "mathtype: OK=#{ok.size} LOI=#{fail.size}"
